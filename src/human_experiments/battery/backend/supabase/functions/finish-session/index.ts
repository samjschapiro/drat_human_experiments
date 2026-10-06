// POST /finish-session  (Authorization: Bearer <session_token>)
//
// Marks the session complete only when the saved events are exactly the
// expected item IDs for that session and slot (35 for Session 1, 22 for
// Session 2). Idempotent. A completed Session 1 is what unlocks Session 2.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS, db, error, expectedItems, json, sessionForToken } from "../_shared/common.ts";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return error(405, "method_not_allowed", "POST required");

    const session = await sessionForToken(req);
    if (session instanceof Response) return session;
    if (session.complete) return json({ session_record_id: session.id, complete: true });

    const supabase = db();
    const { data: events, error: evErr } = await supabase
        .from("study_events").select("item_id").eq("session_id", session.id);
    if (evErr) {
        console.error("event inventory failed", evErr);
        return error(500, "db_error", evErr.message);
    }
    const saved = new Set((events ?? []).map((e: any) => e.item_id));
    const expected = expectedItems(session.session_number, session.slot);
    const missing = [...expected.keys()].filter((id) => !saved.has(id));
    const unexpected = [...saved].filter((id) => !expected.has(id));
    if (missing.length || unexpected.length) {
        return error(409, "incomplete",
            `Session has ${saved.size} of ${expected.size} expected tasks saved.`,
            { missing_item_ids: missing, unexpected_item_ids: unexpected });
    }

    const { error: updErr } = await supabase
        .from("study_sessions")
        .update({ complete: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", session.id).eq("complete", false);
    if (updErr) {
        console.error("finish update failed", updErr);
        return error(500, "db_error", updErr.message);
    }
    return json({ session_record_id: session.id, complete: true });
});
