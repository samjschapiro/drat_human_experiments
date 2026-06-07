/*
 * Battery engine.
 *
 * Reads window.BATTERY_CONFIG + window.ITEM_BANKS (from battery-data.js) and the
 * self-registered window.BATTERY_MODULES (from tests/*.js). Resolves the
 * participant's slot, decodes it into a counterbalanced test ORDER and a DRAT
 * anchor set, runs each enabled test module's sub-timeline in order, and POSTs
 * one JSON-per-session with the raw responses. Scoring is offline.
 *
 * Backend endpoints — set at deploy time by deploy.sh, or hand-edit:
 *   GET  ${API}/getSlot?PROLIFIC_PID=...   → { slot, total_slots, status }
 *   POST ${API}/submitData                  → { status, submission_id }
 */

// =============== CONFIG ===============
// Deployment values come from js/config.js (window.BATTERY_RUNTIME), which is
// gitignored and written by deploy.sh / prepare_battery.py. The placeholders are
// the "not configured" sentinels — real submissions fail loudly if left unset,
// which is correct (debug mode, with no PROLIFIC_PID, never submits).
const RUNTIME = window.BATTERY_RUNTIME || {};
const API_BASE = RUNTIME.API_BASE || "__API_BASE__";
const COMPLETION_URL = RUNTIME.COMPLETION_URL || "__COMPLETION_URL__";
// ======================================

let participantId = "";
let participantSlot = -1;
let isDebugMode = false;
let jsPsych = null;

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// Deterministic shuffle (mulberry32), shared with test modules via ctx.
function seededShuffle(array, seed) {
    function mulberry32(a) {
        return function () {
            let t = (a += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const rng = mulberry32(seed);
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

async function fetchSlot(pid) {
    const res = await fetch(`${API_BASE}/getSlot?PROLIFIC_PID=${encodeURIComponent(pid)}`);
    if (!res.ok) throw new Error(`getSlot returned ${res.status}`);
    return res.json();
}

async function submitData(payload) {
    const res = await fetch(`${API_BASE}/submitData`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`submitData returned ${res.status}`);
    return res.json();
}

function fatal(msg) {
    document.body.innerHTML =
        `<p style="padding:40px;text-align:center">${msg}</p>`;
    throw new Error(msg);
}

// Keep only the fields we care about from each task trial.
function pruneResponse(v) {
    const out = {
        test: v.test,
        item_id: v.item_id,
        response: v.response,
        rt: v.rt,
        timed_out: v.timed_out ?? null,
        trial_index: v.trial_index,
    };
    if (v.task !== undefined) out.task = v.task;        // SCTT
    if (v.prompt !== undefined) out.prompt = v.prompt;  // SCTT
    if (v.set_id !== undefined) out.set_id = v.set_id;  // DRAT
    if (v.anchors !== undefined) out.anchors = v.anchors;
    return out;
}

async function main() {
    const config = window.BATTERY_CONFIG;
    if (!config || !Array.isArray(config.orders) || config.orders.length === 0) {
        fatal("Error: battery-data.js not loaded (missing BATTERY_CONFIG).");
    }

    // Resolve participant + slot.
    const prolificPid = getQueryParam("PROLIFIC_PID");
    if (!prolificPid) {
        isDebugMode = true;
        participantId = `debug_${Date.now()}`;
        const banner = document.getElementById("debug-banner");
        if (banner) banner.style.display = "block";
        participantSlot = 0; // deterministic in debug
    } else {
        participantId = prolificPid;
        const slotResponse = await fetchSlot(participantId);
        participantSlot = slotResponse.slot;
    }

    // Decode slot → (order, anchor set). Opaque to the backend by design.
    const orders = config.orders;
    const orderIndex = participantSlot % orders.length;
    const order = orders[orderIndex];
    const nAnchorSets = config.n_anchor_sets || 1;
    const anchorSetIndex = Math.floor(participantSlot / orders.length) % nAnchorSets;

    // Validate every ordered test has a registered module.
    const modules = window.BATTERY_MODULES || {};
    for (const testId of order) {
        if (!modules[testId] || typeof modules[testId].buildTimeline !== "function") {
            fatal(`Error: no registered module for test "${testId}". ` +
                  `Check the tests/*.js script tags in index.html.`);
        }
    }

    jsPsych = initJsPsych();

    const ctx = {
        jsPsych,
        participantId,
        slot: participantSlot,
        order,
        orderIndex,
        anchorSetIndex,
        seededShuffle,
        makeCountdown: window.makeCountdown,
    };

    // Informed consent — the first screen. The participant must explicitly agree
    // before any task runs; declining ends the study. Replace the body with your
    // IRB-approved language (protocol #, PI contact) before launch.
    const consent = {
        type: jsPsychHtmlButtonResponse,
        stimulus:
            `<div style="text-align:left;max-width:760px;margin:0 auto">
             <h2 style="text-align:center">Consent to Participate</h2>
             <p><b>Purpose.</b> You are invited to take part in a research study on how
                people generate ideas and solve word problems.</p>
             <p><b>Procedure.</b> You will complete ${order.length} short thinking tasks
                (about 15–20 minutes). Please work in one sitting and do not look
                anything up.</p>
             <p><b>Risks &amp; benefits.</b> There are no anticipated risks beyond those
                of everyday computer use. Your participation helps advance research on
                creativity and cognition.</p>
             <p><b>Confidentiality.</b> Your responses are anonymous beyond your
                crowd-platform ID and are stored securely. Data may be shared in
                aggregated, de-identified form.</p>
             <p><b>Voluntary participation.</b> Participation is voluntary; you may stop
                at any time by closing the window.
                <i>[Insert IRB protocol # and researcher contact before launch.]</i></p>
             <p style="text-align:center;margin-top:18px">
                <b>Do you consent to participate?</b></p>
             </div>`,
        choices: ["I agree to participate", "I do not agree"],
        data: { battery_tag: "consent" },
        on_finish: (data) => {
            if (data.response === 1) {
                jsPsych.endExperiment(
                    "<p style='padding:40px;text-align:center'>You have chosen not to " +
                    "participate. You may now close this window.</p>"
                );
            }
        },
    };

    // Per-test sub-timelines, in counterbalanced order.
    const testTrials = [];
    for (const testId of order) {
        const cfg = (config.tests && config.tests[testId]) || {};
        const tctx = { ...ctx, itemBank: (window.ITEM_BANKS || {})[testId] || null };
        testTrials.push(...modules[testId].buildTimeline(cfg, tctx));
    }

    const debrief = {
        type: jsPsychHtmlButtonResponse,
        stimulus: isDebugMode
            ? "<h2>Debug complete</h2><p>Data NOT submitted. See console for payload.</p>"
            : "<h2>Thank you!</h2><p>Submitting your responses…</p>",
        choices: ["Finish"],
        on_finish: async () => {
            const payload = {
                participant_id: participantId,
                slot: participantSlot,
                order_index: orderIndex,
                order: order,
                anchor_set_index: anchorSetIndex,
                responses: jsPsych.data.get()
                    .filter({ battery_tag: "task" })
                    .values()
                    .map(pruneResponse),
                client_metadata: {
                    user_agent: navigator.userAgent,
                    submitted_at: new Date().toISOString(),
                    debug_mode: isDebugMode,
                    battery_version: config.battery_version,
                },
            };

            if (isDebugMode) {
                console.log("DEBUG payload", payload);
                return;
            }
            try {
                await submitData(payload);
                window.location.href = COMPLETION_URL;
            } catch (err) {
                console.error("submitData failed", err);
                document.body.innerHTML =
                    `<p style="padding:40px">Submission failed. Please email the ` +
                    `researchers with this code: <code>${participantId}</code>.</p>`;
            }
        },
    };

    jsPsych.run([consent, ...testTrials, debrief]);
}

main().catch((err) => {
    console.error("Battery failed to start", err);
    if (!document.body.innerHTML.includes("padding:40px")) {
        document.body.innerHTML =
            `<p style="padding:40px">Study failed to start. Please try again. ` +
            `(${err.message})</p>`;
    }
});
