// POST /raven-code  (Authorization: Bearer <session token>)
//
// Returns the current Pearson Q-global group session code that researchers set
// in the admin panel, for the Raven hand-off screen. Only a browser with an
// active Visit 1 token can read it.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS, db, error, json, sessionForToken } from "../_shared/common.ts";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return error(405, "method_not_allowed", "POST required");

    const session = await sessionForToken(req);
    if (session instanceof Response) return session;
    if (session.session_number !== 1) return error(403, "wrong_visit", "The group code is only used in Visit 1.");

    const { data, error: err } = await db().from("study_settings")
        .select("value, updated_at").eq("key", "raven_group_code").maybeSingle();
    if (err) {
        console.error("group code lookup failed", err);
        return error(500, "db_error", err.message);
    }
    return json({ group_code: data?.value ?? null, updated_at: data?.updated_at ?? null });
});
