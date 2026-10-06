// POST /save-block  (Authorization: Bearer <session_token>)  body: one event
// as produced by js/save-client.js.
//
// Checks the event against the session the token belongs to (code, session
// number, record ID, expected item ID) and stores it once. An identical replay
// succeeds without a second row; a different payload under the same event is
// rejected and never overwrites stored data.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
    CORS, MANIFEST, MAX_EVENT_BYTES, db, error, expectedItems, json, sessionForToken,
} from "../_shared/common.ts";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return error(405, "method_not_allowed", "POST required");

    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_EVENT_BYTES) {
        return error(413, "too_large", `event exceeds ${MAX_EVENT_BYTES} bytes`);
    }
    let event: any;
    try { event = JSON.parse(raw); } catch { return error(400, "invalid_json", "invalid JSON"); }

    const session = await sessionForToken(req);
    if (session instanceof Response) return session;
    if (session.complete) return error(409, "session_complete", "This session is already complete.");

    // The payload must describe exactly the session the token belongs to.
    const mismatches: string[] = [];
    if (event.protocol_version !== MANIFEST.protocol_version) mismatches.push("protocol_version");
    if (event.study_code !== session.study_code) mismatches.push("study_code");
    if (event.session_number !== session.session_number) mismatches.push("session_number");
    if (event.session_record_id !== session.id) mismatches.push("session_record_id");
    if (event.assignment?.slot !== session.slot) mismatches.push("assignment.slot");
    if (JSON.stringify(event.assignment?.test_order) !== JSON.stringify(session.test_order)) {
        mismatches.push("assignment.test_order");
    }
    const expected = expectedItems(session.session_number, session.slot);
    const itemId = event.item_id;
    if (typeof itemId !== "string" || !expected.has(itemId)) mismatches.push("item_id");
    else if (event.test_id !== expected.get(itemId)) mismatches.push("test_id");
    if (event.event_id !== `${session.study_code}:${session.session_number}:${itemId}`) {
        mismatches.push("event_id");
    }
    if (mismatches.length) {
        console.error("rejected event", { session: session.id, item_id: itemId, mismatches });
        return error(400, "event_mismatch", `event does not match its session: ${mismatches.join(", ")}`,
            { fields: mismatches });
    }

    const presentationIndex = Number.isInteger(event.assignment?.presentation_index)
        ? event.assignment.presentation_index : null;
    const { data: status, error: err } = await db().rpc("save_event", {
        p_session_id: session.id,
        p_event_id: event.event_id,
        p_test_id: event.test_id,
        p_item_id: itemId,
        p_presentation_index: presentationIndex,
        p_payload: event,
    });
    if (err) {
        console.error("save_event failed", err);
        return error(500, "db_error", err.message);
    }
    if (status === "conflict") {
        console.error("conflicting replay rejected", { session: session.id, event_id: event.event_id });
        return error(409, "event_conflict",
            "A different response was already saved for this task; it was not overwritten.");
    }
    return json({ session_record_id: session.id, status });   // saved | duplicate
});
