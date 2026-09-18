/*
 * Battery engine.
 *
 * Reads window.BATTERY_CONFIG + window.ITEM_BANKS (from battery-data.js) and the
 * self-registered window.BATTERY_MODULES (from tests/*.js). Resolves the
 * participant's slot, decodes it into a counterbalanced test ORDER and a DRAT
 * anchor set, runs each enabled test module's sub-timeline in order, and POSTs
 * one JSON-per-session with the raw responses. Scoring is offline.
 *
 * Page format mirrors the Kombine generation study: consent (with the bonus
 * banner) -> per task, an intro page (title, banner, "In this task…" paragraph,
 * worked example, "Next: N prompts") then its items ("Item i of N" + progress
 * bar, task eyebrow, stimuli chips, instruction paragraph ending in the nudge,
 * the form, a collapsible worked example) -> "Thank you!" completion.
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

// Bonus banner — top of the consent form and on every task intro, as in Kombine.
// Fill in the bracketed amount (and how "overall score" is computed) before launch.
const BONUS_BANNER = `<p style="margin: 0 0 24px; padding: 16px 20px; background: #fff6e0; border: 1px solid #e8c85a; border-left: 5px solid #e0a800; border-radius: 6px; font-size: 16px;">
    <strong>🏆 Bonus:</strong> The highest scores earn extra pay. If your overall score across the tasks is the
    <strong>highest of all participants</strong>, you will receive an <strong>additional [$X] bonus</strong>.
    So take your time and do your best on every task.</p>`;

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

function displayTarget() {
    return document.getElementById("jspsych-target") || document.body;
}

function fatal(msg) {
    displayTarget().innerHTML =
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
    if (v.debug_skipped) out.debug_skipped = true;
    return out;
}

// ---------------- shared page furniture (Kombine format) ----------------
// Item numbering runs across the whole battery ("Item 7 of 44"); the total is
// only known once every module has been built, so item html is a function that
// reads it at trial time.
const progress = { total: 0 };

function esc(s) {
    return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
        .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function header(index) {
    const pct = ((index + 1) / progress.total) * 100;
    return `<div class="kb-progress">Item ${index + 1} of ${progress.total}</div>
    <div style="height:3px;background:#e0dde6;border-radius:2px;margin:6px 0 18px;">
      <div style="width:${pct}%;height:100%;background:#007bff;border-radius:2px;"></div></div>`;
}

// Stimuli as chips: chips(["fire","ice"], "&") → [fire] & [ice]. Classes cycle a/b
// unless overridden (["solo"] for a neutral set).
function chips(words, tween, classes) {
    const cls = classes || ["a", "b"];
    return `<div class="kb-pair">` +
        words.map((w, i) => `<span class="kb-chip ${cls[i % cls.length]}">${esc(w)}</span>`)
             .join(`<span class="kb-tween">${tween}</span>`) +
        `</div>`;
}

// Numbered single-word boxes; with `values`, a read-only filled-in example.
function wordGrid(n, values, readonly) {
    let h = `<div class="kb-words">`;
    for (let i = 0; i < n; i++) {
        const v = values && values[i] !== undefined ? ` value="${esc(values[i])}"` : "";
        h += `<div class="w"><span class="tnum">${i + 1}</span>` +
             `<input type="text" name="w${i}" autocomplete="off" spellcheck="false"${v}` +
             `${readonly ? " readonly" : ""}></div>`;
    }
    return h + `</div>`;
}

// Readonly example cells and typed answers auto-size to their content, so nothing
// is clipped (Kombine does the same for its analogy/blend cells).
function growCells(root) {
    (root || document).querySelectorAll("textarea").forEach((el) => {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
    });
}

// The worked example lives in a collapsed <details>: its cells have no height until
// it is opened, so size them on toggle. Also grow any textarea as it is typed into.
function wireCells() {
    document.querySelectorAll("details.kb-example").forEach((d) =>
        d.addEventListener("toggle", () => growCells(d)));
    document.querySelectorAll("textarea").forEach((t) =>
        t.addEventListener("input", () => {
            t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
        }));
    growCells();
}

// A task whose instruction is self-explanatory can omit example(); nothing is drawn.
function exampleBlock(html) {
    if (!html) return "";
    return `<details class="kb-example"><summary>See a worked example</summary>
    <div class="body">${html}</div></details>`;
}

function wrap(inner, width) {
    return `<div style="text-align:left; max-width:${width || 660}px; margin:0 auto;">${inner}</div>`;
}

function duration(sec) {
    if (sec % 60 === 0) { const m = sec / 60; return `${m} minute${m === 1 ? "" : "s"}`; }
    return `${sec} seconds`;
}

// One short clause on the time limit, for the end of an intro paragraph.
function timing(sec, per) {
    if (!sec) return "There is no time limit.";
    const scope = per ? ` for each ${per}` : "";
    return `You have <b>${duration(sec)}</b>${scope}; when the clock runs out, whatever you ` +
           `have typed is sent.`;
}

// The description for a task, shown immediately before that task's block of items.
function createTaskIntro(mod, cfg, ctx, n) {
    const noun = mod.eyebrow;
    return {
        type: jsPsychInstructions,
        show_clickable_nav: true,
        button_label_next: `Start the ${noun} prompts`,
        pages: [
            `<div style="max-width:720px;margin:0 auto;text-align:left;"><h3 style="color:${mod.color}">${mod.title}</h3>
        ${BONUS_BANNER}
        <p>${mod.intro(cfg, ctx)}</p>
        ${mod.example ? `<div style="color:#666;margin-top:8px;">${mod.example(cfg, ctx)}</div>` : ""}
        <p style="margin-top:16px;color:#888;font-size:14px;">Next: ${n} ${noun} ${n === 1 ? "prompt" : "prompts"}.</p></div>`,
        ],
        data: { battery_tag: "intro", test: mod.id },
        on_load: () => growCells(),
    };
}

/* ------------------------------------------------------------ debug skipping */
// In debug mode (no PROLIFIC_PID) a small bar lets you skip the current page, or the
// rest of the current task's items, without filling anything in. Skipped trials are
// recorded with debug_skipped: true. Ported from the Kombine study.
let currentTask = null;
const debugSkipTask = {};

function createDebugBar() {
    const bar = document.createElement("div");
    bar.className = "kb-debugbar";
    bar.innerHTML = `<span>DEBUG</span>` +
        `<button type="button" id="dbgSkipItem">Skip this page</button>` +
        `<button type="button" id="dbgSkipTask">Skip rest of task</button>`;
    document.body.appendChild(bar);
    const finish = () => jsPsych.finishTrial({ response: {}, debug_skipped: true });
    bar.querySelector("#dbgSkipItem").addEventListener("click", finish);
    bar.querySelector("#dbgSkipTask").addEventListener("click", () => {
        if (currentTask) debugSkipTask[currentTask] = true;
        finish();
    });
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
        const m = modules[testId];
        if (!m || typeof m.buildTrials !== "function" || typeof m.intro !== "function") {
            fatal(`Error: no registered module for test "${testId}". ` +
                  `Check the tests/*.js script tags in index.html.`);
        }
    }

    jsPsych = initJsPsych({ display_element: "jspsych-target" });

    const ctx = {
        jsPsych,
        participantId,
        slot: participantSlot,
        order,
        orderIndex,
        anchorSetIndex,
        seededShuffle,
        makeCountdown: window.makeCountdown,
        // page furniture
        esc, header, chips, wordGrid, exampleBlock, wrap, duration, timing,
        growCells, wireCells,
        itemStart: 0,
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
                ${BONUS_BANNER}
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

    // Per-test blocks in counterbalanced order: each task's intro appears right
    // before its own items, and item numbers run across the whole battery.
    const testTrials = [];
    for (const testId of order) {
        const mod = modules[testId];
        const cfg = (config.tests && config.tests[testId]) || {};
        const tctx = { ...ctx, itemBank: (window.ITEM_BANKS || {})[testId] || null,
                       itemStart: progress.total };
        const trials = mod.buildTrials(cfg, tctx);
        const n = trials.filter((t) => t.data && t.data.battery_tag === "task").length;
        progress.total += n;
        testTrials.push(createTaskIntro(mod, cfg, tctx, n));
        for (const trial of trials) {
            // remember which task is on screen, so the debug bar's "skip rest of task"
            // knows what to drop (the module keeps its own on_load).
            const modLoad = trial.on_load;
            trial.on_load = function () {
                currentTask = testId;
                if (modLoad) modLoad.apply(this, arguments);
            };
            // wrapped so "skip rest of task" (debug) can drop the block's remaining items
            testTrials.push(isDebugMode
                ? { timeline: [trial], conditional_function: () => !debugSkipTask[testId] }
                : trial);
        }
    }

    const completion = {
        type: jsPsychHtmlButtonResponse,
        stimulus: () =>
            `<div style="max-width:600px;margin:0 auto;text-align:center;"><h1>Thank you!</h1>
      <p>You've completed all ${progress.total} prompts.</p>` +
            (isDebugMode
                ? `<p><strong>Debug mode:</strong> nothing is submitted; your data is logged to the console.</p>`
                : `<p>Click below to submit your responses.</p>`) +
            `</div>`,
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
                displayTarget().innerHTML =
                    `<div style="padding:40px;max-width:700px;margin:0 auto;font-size:16px">` +
                    `<h2>Your answers could not be saved</h2>` +
                    `<p>Something went wrong when sending your answers. Please do not ` +
                    `close this window. Tell the researcher, or email ` +
                    `<em>[researcher email]</em>, and give them this code:</p>` +
                    `<p style="font-size:22px"><code>${participantId}</code></p></div>`;
            }
        },
    };

    if (isDebugMode) createDebugBar();

    jsPsych.run([consent, ...testTrials, completion]);
}

main().catch((err) => {
    console.error("Battery failed to start", err);
    const target = document.getElementById("jspsych-target") || document.body;
    if (!target.innerHTML.includes("padding:40px")) {
        target.innerHTML =
            `<p style="padding:40px">Study failed to start. Please try again. ` +
            `(${err.message})</p>`;
    }
});
