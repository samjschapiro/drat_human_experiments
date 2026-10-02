/* Local two-session study preview. The current deploy branch remains production-locked. */
const DEPLOY_ENV = (window.DEPLOY_CONFIG || {}).ENV || "";
const API_BASE = (window.DEPLOY_CONFIG || {}).API_BASE || "";

function seededShuffle(array, seed) {
    function random(a) {
        return function () {
            let t = (a += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const rng = random(seed);
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function fatal(message) {
    document.body.innerHTML = "<main style='padding:40px;text-align:center' role='alert'></main>";
    document.querySelector("main").textContent = message;
    throw new Error(message);
}

function recordableResponse(data) {
    return {
        test: data.test,
        item_id: data.item_id,
        response: data.response,
        rt: data.rt,
        timed_out: data.timed_out ?? false,
        presentation_index: data.presentation_index ?? null,
        anchor_size: data.anchor_size ?? null,
        relation: data.relation ?? null,
        triplet_id: data.triplet_id ?? null,
        pair_id: data.pair_id ?? null,
        set_id: data.set_id ?? null,
        anchors: data.anchors ?? null,
        task: data.task ?? null,
        prompt: data.prompt ?? null,
        displayed_stimuli: data.displayed_stimuli ?? {},
        attention_check: data.attention_check ?? null,
    };
}

function attachCapture(timeline, store) {
    const remaining = [];
    for (const trial of timeline) {
        if (trial.data?.battery_tag !== "task") {
            remaining.push(trial);
            continue;
        }
        if (!trial.data.item_id) throw new Error("Every study task must have a stable item ID");
        if (store.hasItem(trial.data.item_id)) continue; // resume after a refresh
        const onLoad = trial.on_load;
        const onFinish = trial.on_finish;
        let startedAt = null;
        trial.on_load = () => {
            startedAt = new Date().toISOString();
            if (onLoad) onLoad();
        };
        trial.on_finish = (data) => {
            if (onFinish) onFinish(data);
            store.record(recordableResponse(data), startedAt || new Date().toISOString(),
                         new Date().toISOString());
        };
        remaining.push(trial);
    }
    return remaining;
}

function showLocalResult(saved) {
    document.body.innerHTML = `<main style="max-width:650px;margin:8vh auto;padding:24px;background:white">
        <h1>Local preview complete</h1>
        <p>All completed blocks are saved in this browser under the deidentified study code.</p>
        <p>Session record: <code id="record-id"></code></p>
        <p>Saved events: <strong id="event-count"></strong></p>
        <button id="download-data" class="jspsych-btn">Download local test data</button>
        <p>Keep this download on a secure study computer; this prototype has not sent data to Supabase.</p>
    </main>`;
    document.getElementById("record-id").textContent = saved.session_record_id;
    document.getElementById("event-count").textContent = String(Object.keys(saved.events).length);
    document.getElementById("download-data").addEventListener("click", () => {
        const payload = {
            study_code: saved.study_code,
            session_number: saved.session_number,
            session_record_id: saved.session_record_id,
            slot: saved.slot,
            order: saved.order,
            protocol_version: saved.protocol_version,
            complete: saved.complete,
            responses: Object.values(saved.events).map((event) => ({
                ...event.payload,
                test: event.payload.test_id,
                item_id: event.payload.item_id,
                rt: event.payload.response_time_ms,
                ...event.payload.assignment,
            })),
        };
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
        link.download = `drat-local-session-${saved.session_number}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
}

async function main() {
    const config = window.BATTERY_CONFIG;
    const study = window.STUDY_CONFIG;
    const materials = window.STUDY_MATERIALS;
    if (!config || !study || !materials || materials.protocol_version !== study.protocolVersion) {
        fatal("The generated study materials or configuration are missing or out of date.");
    }
    if (study.localPreviewOnly && API_BASE) {
        fatal("This study-flow branch is a local preview. Its block-save backend is not configured for deployment.");
    }
    if (DEPLOY_ENV === "prod") fatal("This study-flow preview is not approved for participant launch.");
    document.body.dataset.banner = "LOCAL PREVIEW — deidentified test data stays in this browser";

    const { studyCode, sessionNumber } = await window.requestStudyEntry();
    const slotParam = new URLSearchParams(location.search).get("slot");
    const slot = slotParam === null ? 0 : Number(slotParam);
    if (!Number.isInteger(slot) || slot < 0 || slot >= materials.assignments.length) {
        fatal("The local preview slot must match one of the generated assignments.");
    }
    const order = sessionNumber === 1
        ? study.session1Orders[slot % study.session1Orders.length]
        : ["drat", "sctt"];
    const store = window.createStudyStore({
        studyCode, sessionNumber, slot, order,
        protocolVersion: study.protocolVersion, apiBase: API_BASE,
    });
    if (store.snapshot().complete) {
        showLocalResult(store.snapshot());
        return;
    }
    const jsPsych = initJsPsych();
    const ctx = {
        jsPsych, participantId: studyCode, slot, order,
        config, seededShuffle, makeCountdown: window.makeCountdown,
        ravenUrl: study.ravenUrl,
    };
    const timeline = sessionNumber === 1
        ? window.STUDY_SESSIONS.buildSession1(ctx)
        : window.STUDY_SESSIONS.buildSession2(ctx);
    const remaining = attachCapture(timeline, store);
    remaining.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: "<h2>Thank you</h2><p>Finish this local preview and review the saved study record.</p>",
        choices: ["Finish"],
        on_finish: async () => {
            try {
                showLocalResult(await store.finish());
            } catch (error) {
                fatal(`Could not finish saving this session: ${error.message}`);
            }
        },
    });
    jsPsych.run(remaining);
}

main().catch((error) => {
    console.error("Study preview failed:", error);
    if (!document.querySelector("main[role='alert']")) {
        document.body.innerHTML = "<main style='padding:40px' role='alert'></main>";
        document.querySelector("main").textContent = `Study preview failed: ${error.message}`;
    }
});
