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
            `<div style="width: 800px; font-size: 16px; text-align: left; margin: 0 auto; padding: 20px 0;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #333; font-size: 24px; margin-bottom: 10px;">Creativity and Cognition Study</h1>
                    <p style="color: #666; font-size: 16px;">Research Consent Form</p>
                </div>
                <p>Dear Participant,</p>
                <p>Thank you for your interest in our research! We are researchers interested in understanding how people generate ideas and solve creative thinking problems.</p>
                <p><strong>Study Purpose:</strong> We are conducting research on creative and associative thinking — how people come up with diverse ideas, find connections between words, and reason about scientific problems. This helps us understand creativity and validate methods for measuring it.</p>
                <p><strong>What You Will Do:</strong> You will complete a series of ${order.length} short thinking tasks. Depending on the task, you will type words that are as different from one another as possible, find a word that connects a group of words, or write brief responses to scientific-thinking scenarios. Some tasks are timed. The study takes approximately 15–20 minutes and is administered in person on this computer.</p>
                <p><strong>Data We Collect:</strong> We will collect the following data during this study:
                <br>• Your typed responses to each task
                <br>• Timestamps and response times
                <br>• Basic technical information (browser type, screen resolution)
                <br>• A participant code assigned by the research team for data management
                <br>We do NOT collect your name or any other personally identifiable information. The participant code is not linked to your identity.</p>
                <p><strong>Data Use and Storage:</strong> Your data will be:
                <br>• Stored securely on encrypted servers for up to 7 years for research purposes
                <br>• Used to study creative thinking and to validate automated creativity-scoring methods
                <br>• Potentially shared in anonymized form with other researchers or made publicly available for scientific transparency
                <br>• Processed under legitimate research interest as permitted by applicable data-protection laws</p>
                <p><strong>Your Rights:</strong> Your participation is completely voluntary. You may:
                <br>• Refuse to participate without penalty
                <br>• Withdraw from the study at any time by telling the researcher or closing this window
                <br>• Request deletion of your data by contacting the research team with your participant code within 30 days of participation
                <br>• Contact your local data protection authority with any concerns</p>
                <p><strong>Risks and Benefits:</strong> There are no risks beyond those of normal computer use. Your participation contributes to research on understanding creativity. <em>[Compensation, if any, will be described to you by the research team.]</em></p>
                <p><strong>Contact:</strong> For questions about this study, contact the research team: <em>[researcher name and email]</em>. For questions about your rights as a participant, contact the <em>[institutional review board / research ethics committee and contact]</em>.</p>
                <p style="margin-top: 30px; padding: 20px; background: #f0f8ff; border-left: 4px solid #007bff;">
                    <strong>Informed Consent Statement:</strong><br>
                    I understand the information provided above about this research study. I understand:
                    <br>• The purpose of the study and what I will be asked to do
                    <br>• What data will be collected and how it will be used
                    <br>• My rights including the ability to withdraw at any time
                    <br>• How my data will be stored and potentially shared
                    <br><br>
                    I am 18 years of age or older and voluntarily agree to participate in this study.
                </p>
            </div>`,
        choices: ["I agree to participate", "I do not agree"],
        data: { battery_tag: "consent" },
        on_finish: (data) => {
            if (data.response === 1) {
                jsPsych.endExperiment(
                    "<p style='padding:40px;text-align:center'>You have chosen not to " +
                    "participate. Please let the researcher know. You may now close this window.</p>"
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
