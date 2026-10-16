// POST /admin  (Authorization: Bearer <DATA_EXPORT_TOKEN or admin-panel token>)  — researchers only.
//
// Actions (body.action):
//   login           { email, password }            (no Authorization needed)
//       Admin panel sign-in: an email in RESEARCHER_EMAILS plus ADMIN_PASSWORD.
//       Returns a 12-hour token for the other actions and get-data.
//   get_group_code  {}
//   set_group_code  { code }
//       The Pearson Q-global group session code shown on the Raven screen.
//       Overwrite it for each lab session.
//   add_codes       { codes: ["DRAT-001", ...] }
//       Load issued study codes (e.g. exported from the lab registration site).
//       Idempotent; the whole request is rejected if any code is malformed.
//   generate_codes  { count: 20, prefix: "DRAT" }
//       Create `count` new random codes, store them, and return them.
//   reset_session   { email | study_code, session_number, reason }
//       Archive the active session (reset_at set, events kept) so the
//       participant can start that visit again. The slot is kept. Session 1 cannot be reset
//       while an active Session 2 exists; reset Session 2 first.
//
// Changes (set_group_code, reset_session) are written to admin_audit with the
// researcher's email.
//
// Participants now sign in with their Stony Brook email, which the server
// maps to an internal code (participants table); add_codes / generate_codes
// remain for researcher test codes only.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
    CORS, STUDY_CODE_RE, checkAdminLogin, db, error, issueAdminToken, json, normalizeCode, normalizeEmail,
    randomCode, requireResearcher,
} from "../_shared/common.ts";

const GROUP_CODE_KEY = "raven_group_code";

async function audit(researcher: string, action: string, detail: object) {
    const { error: err } = await db().from("admin_audit").insert({ researcher, action, detail });
    if (err) throw err;
}

const MAX_CODES_PER_REQUEST = 1000;

async function addCodes(codes: string[]) {
    const { data, error: err } = await db()
        .from("study_codes")
        .upsert(codes.map((code) => ({ code })), { onConflict: "code", ignoreDuplicates: true })
        .select("code");
    if (err) throw err;
    const added = new Set((data ?? []).map((r: any) => r.code));
    return { added: [...added], already_present: codes.filter((c) => !added.has(c)) };
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return error(405, "method_not_allowed", "POST required");
    let body: any;
    try { body = await req.json(); } catch { return error(400, "invalid_json", "invalid JSON"); }

    if (body.action === "login") {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const result = checkAdminLogin(email, password);
        if (result === "not_configured") return error(500, "not_configured", "admin login is not configured");
        if (result === "denied") {
            await new Promise((r) => setTimeout(r, 1000));   // slow down guessing
            return error(401, "unauthorized", "That email and password are not accepted.");
        }
        return json({ action: "login", email, ...(await issueAdminToken(email)) });
    }

    const auth = await requireResearcher(req);
    if (auth instanceof Response) return auth;
    const researcher = auth.researcher;

    try {
        switch (body.action) {
            case "get_group_code": {
                const { data, error: err } = await db().from("study_settings")
                    .select("value, updated_at, updated_by").eq("key", GROUP_CODE_KEY).maybeSingle();
                if (err) throw err;
                return json({ action: "get_group_code", researcher, group_code: data?.value ?? null,
                              updated_at: data?.updated_at ?? null, updated_by: data?.updated_by ?? null });
            }

            case "set_group_code": {
                const code = typeof body.code === "string" ? body.code.trim() : "";
                if (!/^[\x21-\x7E]{1,64}$/.test(code)) {
                    return error(400, "invalid_request", "code must be 1–64 visible characters with no spaces");
                }
                const { data, error: err } = await db().from("study_settings")
                    .upsert({ key: GROUP_CODE_KEY, value: code, updated_at: new Date().toISOString(),
                              updated_by: researcher })
                    .select("value, updated_at, updated_by").single();
                if (err) throw err;
                await audit(researcher, "set_group_code", { code });
                return json({ action: "set_group_code", group_code: data.value,
                              updated_at: data.updated_at, updated_by: data.updated_by });
            }

            case "add_codes": {
                if (!Array.isArray(body.codes) || body.codes.length === 0) {
                    return error(400, "invalid_request", "codes must be a non-empty array");
                }
                if (body.codes.length > MAX_CODES_PER_REQUEST) {
                    return error(400, "too_many", `at most ${MAX_CODES_PER_REQUEST} codes per request`);
                }
                const normalized = body.codes.map(normalizeCode);
                const invalid = body.codes.filter((_: unknown, i: number) => normalized[i] === null);
                if (invalid.length) {
                    return error(400, "invalid_codes",
                        "Codes must be 3–32 letters, numbers, or hyphens. Nothing was added.", { invalid });
                }
                const unique = [...new Set(normalized as string[])];
                return json({ action: "add_codes", ...(await addCodes(unique)) });
            }

            case "generate_codes": {
                const count = body.count;
                const prefix = typeof body.prefix === "string" ? body.prefix.toUpperCase() : "";
                if (!Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_REQUEST) {
                    return error(400, "invalid_request", `count must be 1–${MAX_CODES_PER_REQUEST}`);
                }
                if (!/^[A-Z0-9]{1,10}$/.test(prefix)) {
                    return error(400, "invalid_request", "prefix must be 1–10 letters or digits");
                }
                const codes = new Set<string>();
                while (codes.size < count) codes.add(randomCode(prefix, 6));
                for (const c of codes) if (!STUDY_CODE_RE.test(c)) throw new Error(`bad generated code ${c}`);
                const result = await addCodes([...codes]);
                if (result.already_present.length) {
                    // Astronomically unlikely collision; say so rather than return fewer codes.
                    return error(409, "collision", "generated code collided; retry", result);
                }
                return json({ action: "generate_codes", codes: result.added });
            }

            case "reset_session": {
                const sessionNumber = body.session_number;
                const reason = typeof body.reason === "string" ? body.reason.trim() : "";
                const supabase = db();
                let code: string | null = null;
                if (body.email !== undefined) {
                    const email = normalizeEmail(body.email);
                    if (!email) return error(400, "invalid_request", "email must be a @stonybrook.edu address");
                    const { data: p, error: pErr } = await supabase.from("participants")
                        .select("study_code").eq("email", email).maybeSingle();
                    if (pErr) throw pErr;
                    if (!p) return error(404, "unknown_email", "No participant has this email.");
                    code = p.study_code;
                } else {
                    code = normalizeCode(body.study_code);
                }
                if (!code || (sessionNumber !== 1 && sessionNumber !== 2) || !reason) {
                    return error(400, "invalid_request", "email or study_code, session_number (1|2) and reason are required");
                }
                if (sessionNumber === 1) {
                    const { data: s2 } = await supabase.from("study_sessions").select("id")
                        .eq("study_code", code).eq("session_number", 2).is("reset_at", null).maybeSingle();
                    if (s2) return error(409, "session2_active", "Reset Session 2 first.");
                }
                const { data, error: err } = await supabase.from("study_sessions")
                    .update({ reset_at: new Date().toISOString(), reset_reason: reason })
                    .eq("study_code", code).eq("session_number", sessionNumber).is("reset_at", null)
                    .select("id, slot");
                if (err) throw err;
                if (!data?.length) return error(404, "no_active_session", "No active session to reset.");
                await audit(researcher, "reset_session", { study_code: code, session_number: sessionNumber,
                    reason, archived_session_record_id: data[0].id });
                return json({ action: "reset_session", study_code: code, session_number: sessionNumber,
                              archived_session_record_id: data[0].id, slot_kept: data[0].slot });
            }

            default:
                return error(400, "unknown_action",
                    "action must be login, get_group_code, set_group_code, add_codes, generate_codes or reset_session");
        }
    } catch (err: any) {
        console.error("admin action failed", body.action, err);
        return error(500, "db_error", err.message ?? String(err));
    }
});
