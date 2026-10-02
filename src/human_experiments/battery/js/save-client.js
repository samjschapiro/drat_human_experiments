/* Synchronous local capture; optional retryable /save-block transport for dev later. */
window.createStudyStore = function createStudyStore({ studyCode, sessionNumber, slot, order, protocolVersion, apiBase }) {
    const key = `thinking-tasks:${protocolVersion}:${studyCode}:session-${sessionNumber}`;
    const saved = JSON.parse(localStorage.getItem(key) || "null") || {
        study_code: studyCode,
        session_number: sessionNumber,
        session_record_id: `local-${studyCode}-s${sessionNumber}`,
        slot,
        order,
        protocol_version: protocolVersion,
        events: {},
        complete: false,
    };
    if (saved.slot !== slot || JSON.stringify(saved.order) !== JSON.stringify(order)) {
        throw new Error("Saved session assignment differs from the current assignment; ask a researcher to review it.");
    }
    let flushing = null;

    function persist() {
        localStorage.setItem(key, JSON.stringify(saved));
    }

    async function flush() {
        if (!apiBase) return;
        if (flushing) return flushing;
        flushing = (async () => {
            for (const event of Object.values(saved.events)) {
                if (event.synced) continue;
                event.payload.session_record_id = saved.session_record_id;
                const response = await fetch(`${apiBase}/save-block`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(event.payload),
                });
                if (!response.ok) throw new Error(`Block save failed (${response.status})`);
                const result = await response.json();
                if (!result.session_record_id) throw new Error("Block save did not return a session record ID");
                saved.session_record_id = result.session_record_id;
                event.synced = true;
                persist();
            }
        })().finally(() => { flushing = null; });
        return flushing;
    }

    return {
        hasItem: (itemId) => Boolean(saved.events[`${sessionNumber}:${itemId}`]),
        record(response, startedAt, completedAt) {
            const localKey = `${sessionNumber}:${response.item_id}`;
            if (saved.events[localKey]) return;
            const eventId = `${studyCode}:${localKey}`;
            const payload = {
                protocol_version: protocolVersion,
                study_code: studyCode,
                session_number: sessionNumber,
                session_record_id: saved.session_record_id,
                event_id: eventId,
                test_id: response.test,
                block_id: response.item_id,
                item_id: response.item_id,
                assignment: { slot, test_order: order, presentation_index: response.presentation_index ?? null,
                              anchor_size: response.anchor_size ?? null, relation: response.relation ?? null,
                              source_triplet_id: response.triplet_id ?? null },
                displayed_stimuli: response.displayed_stimuli ?? {},
                response: response.response ?? {},
                task: response.task ?? null,
                prompt: response.prompt ?? null,
                anchors: response.anchors ?? null,
                set_id: response.set_id ?? null,
                pair_id: response.pair_id ?? null,
                started_at: startedAt,
                completed_at: completedAt,
                response_time_ms: response.rt ?? null,
                timed_out: response.timed_out ?? false,
                attention_check: response.attention_check ?? null,
                app_version: "local-study-prototype",
            };
            saved.events[localKey] = { payload, synced: false };
            // The write completes before jsPsych advances to the next trial.
            persist();
            if (apiBase) flush().catch((error) => console.error("Save queued for retry:", error));
        },
        async finish() {
            await flush();
            saved.complete = true;
            persist();
            return saved;
        },
        snapshot: () => saved,
        flush,
    };
};
