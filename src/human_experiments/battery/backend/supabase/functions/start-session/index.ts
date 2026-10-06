// POST /start-session  { protocol_version, study_code, session_number }
//
// Starts or resumes a session for an issued study code. The server is
// authoritative for the slot, the test order and the Session 1 -> 2 gate.
// Every call issues a fresh session token (only its hash is stored), so
// re-entering the code on another computer resumes there and invalidates
// the old tab. Returns the item IDs already saved so the browser can skip them.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS, MANIFEST, db, error, json, normalizeCode, randomToken, sha256Hex } from "../_shared/common.ts";

const STATUS_ERRORS: Record<string, [number, string]> = {
    unknown_code: [404, "This study code was not found. Check it with a researcher."],
    session1_incomplete: [409, "Session 2 can only start after Session 1 is complete for this study code."],
    slots_full: [409, "No study slots are left. Tell a researcher."],
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return error(405, "method_not_allowed", "POST required");

    let body: any;
    try { body = await req.json(); } catch { return error(400, "invalid_json", "invalid JSON"); }

    if (body.protocol_version !== MANIFEST.protocol_version) {
        return error(400, "protocol_mismatch",
            `protocol_version must be ${MANIFEST.protocol_version}; reload the page.`);
    }
    const code = normalizeCode(body.study_code);
    if (!code) return error(400, "invalid_code", "Use 3–32 letters, numbers, or hyphens.");
    const sessionNumber = body.session_number;
    if (sessionNumber !== 1 && sessionNumber !== 2) {
        return error(400, "invalid_session", "session_number must be 1 or 2");
    }

    const token = randomToken();
    const supabase = db();
    const { data, error: err } = await supabase.rpc("start_session", {
        p_code: code,
        p_session_number: sessionNumber,
        p_token_hash: await sha256Hex(token),
        p_protocol: MANIFEST.protocol_version,
        p_session1_orders: MANIFEST.session1_orders,
        p_session2_order: MANIFEST.session2_order,
    });
    if (err) {
        console.error("start_session failed", err);
        return error(500, "db_error", err.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (STATUS_ERRORS[row.status]) {
        const [status, message] = STATUS_ERRORS[row.status];
        return error(status, row.status, message);
    }
    if (row.slot >= MANIFEST.n_slots) {
        // Slots exist in the DB beyond the assignment bundle: deployment mismatch.
        return error(500, "slot_out_of_range", `slot ${row.slot} has no DRAT assignment`);
    }

    const { data: events, error: evErr } = await supabase
        .from("study_events").select("item_id").eq("session_id", row.session_id);
    if (evErr) {
        console.error("event inventory failed", evErr);
        return error(500, "db_error", evErr.message);
    }

    return json({
        protocol_version: MANIFEST.protocol_version,
        session_record_id: row.session_id,
        // A completed session gets no usable token: nothing more can be saved.
        session_token: row.status === "complete" ? null : token,
        study_code: code,
        slot: row.slot,
        session_number: sessionNumber,
        test_order: row.test_order,
        saved_item_ids: (events ?? []).map((e: any) => e.item_id),
        complete: row.complete,
        status: row.status,          // started | resumed | complete
    });
});
