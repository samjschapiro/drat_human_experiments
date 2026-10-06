/*
 * Event store: every recordable task is written to localStorage synchronously
 * (so a crash or refresh never loses it), then sent to POST /save-block.
 *
 * Online (apiBase set): the session record ID, token and already-saved items
 * come from /start-session; saves carry `Authorization: Bearer <token>`; and
 * finish() only succeeds once /finish-session confirms the server has every
 * expected task. localStorage is a retry cache, not the source of truth.
 *
 * Offline (no apiBase, i.e. opening index.html locally): local preview only.
 */
window.createStudyStore = function createStudyStore({
    studyCode, sessionNumber, slot, order, protocolVersion, apiBase,
    sessionRecordId = null, sessionToken = null, serverSavedItemIds = [], appVersion,
}) {
    const online = Boolean(apiBase);
    if (online && (!sessionRecordId || !sessionToken)) {
        throw new Error("Online session is missing its record ID or token");
    }
    // Online stores are keyed by the server record, so a researcher reset (new
    // record) starts a clean local cache instead of reusing the archived one.
    const key = online
        ? `thinking-tasks:${protocolVersion}:${sessionRecordId}`
        : `thinking-tasks:${protocolVersion}:${studyCode}:session-${sessionNumber}`;
    const saved = JSON.parse(localStorage.getItem(key) || "null") || {
        study_code: studyCode,
        session_number: sessionNumber,
        session_record_id: sessionRecordId || `local-${studyCode}-s${sessionNumber}`,
        slot,
        order,
        protocol_version: protocolVersion,
        events: {},
        complete: false,
    };
    if (saved.slot !== slot || JSON.stringify(saved.order) !== JSON.stringify(order)) {
        throw new Error("Saved session assignment differs from the current assignment; ask a researcher to review it.");
    }
    const serverSaved = new Set(serverSavedItemIds);
    let flushing = null;

    function persist() {
        localStorage.setItem(key, JSON.stringify(saved));
    }

    async function post(path, body) {
        const response = await fetch(`${apiBase}/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
            body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        return { response, result };
    }

    // Sends every unsynced event. Loops until none are left, so an event
    // recorded while an earlier send was in flight is not skipped (finish()
    // relies on this before asking the server to close the session).
    async function flush() {
        if (!online) return;
        for (;;) {
            if (flushing) {
                await flushing;
                continue;
            }
            const pending = Object.values(saved.events).filter((event) => !event.synced);
            if (pending.length === 0) return;
            flushing = sendAll(pending).finally(() => { flushing = null; });
            await flushing;
        }
    }

    async function sendAll(pending) {
        for (const event of pending) {
            if (event.synced) continue;
            const { response, result } = await post("save-block", event.payload);
            if (response.status === 409 && result.error === "event_conflict") {
                // The server already holds a different response for this task and
                // keeps it; don't block the session on it, but leave a trace.
                console.error("Server kept an earlier response for", event.payload.item_id);
                event.synced = true;
                event.conflict = true;
                persist();
                continue;
            }
            if (!response.ok) {
                throw new Error(result.message || `Block save failed (${response.status})`);
            }
            if (result.session_record_id !== saved.session_record_id) {
                throw new Error("Block save returned a different session record ID");
            }
            event.synced = true;
            persist();
        }
    }

    return {
        online,
        hasItem: (itemId) => serverSaved.has(itemId) || Boolean(saved.events[`${sessionNumber}:${itemId}`]),
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
                app_version: appVersion,
            };
            saved.events[localKey] = { payload, synced: false };
            // The write completes before jsPsych advances to the next trial.
            persist();
            if (online) flush().catch((error) => console.error("Save queued for retry:", error));
        },
        async finish() {
            await flush();
            if (online) {
                const { response, result } = await post("finish-session", {});
                if (!response.ok || result.complete !== true) {
                    const missing = result.missing_item_ids?.length
                        ? ` Missing: ${result.missing_item_ids.join(", ")}.` : "";
                    throw new Error((result.message || `Finish failed (${response.status})`) + missing);
                }
            }
            saved.complete = true;
            persist();
            return saved;
        },
        snapshot: () => saved,
        flush,
    };
};
