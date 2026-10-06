// POST /admin  (Authorization: Bearer <DATA_EXPORT_TOKEN>)  — researchers only.
//
// Actions (body.action):
//   add_codes       { codes: ["DRAT-001", ...] }
//       Load issued study codes (e.g. exported from the lab registration site).
//       Idempotent; the whole request is rejected if any code is malformed.
//   generate_codes  { count: 20, prefix: "DRAT" }
//       Create `count` new random codes, store them, and return them.
//   reset_session   { study_code, session_number, reason }
//       Archive the active session (reset_at set, events kept) so the code can
//       start that session again. The slot is kept. Session 1 cannot be reset
//       while an active Session 2 exists; reset Session 2 first.
//
// Only deidentified codes ever reach this backend; the code-to-person key is
// held by the study team elsewhere.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS, STUDY_CODE_RE, db, error, json, normalizeCode, requireResearcher } from "../_shared/common.ts";

const MAX_CODES_PER_REQUEST = 1000;
// No 0/O/1/I/L, so codes survive being read aloud or handwritten.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomSuffix(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

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
    const denied = requireResearcher(req);
    if (denied) return denied;

    let body: any;
    try { body = await req.json(); } catch { return error(400, "invalid_json", "invalid JSON"); }

    try {
        switch (body.action) {
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
                while (codes.size < count) codes.add(`${prefix}-${randomSuffix(6)}`);
                for (const c of codes) if (!STUDY_CODE_RE.test(c)) throw new Error(`bad generated code ${c}`);
                const result = await addCodes([...codes]);
                if (result.already_present.length) {
                    // Astronomically unlikely collision; say so rather than return fewer codes.
                    return error(409, "collision", "generated code collided; retry", result);
                }
                return json({ action: "generate_codes", codes: result.added });
            }

            case "reset_session": {
                const code = normalizeCode(body.study_code);
                const sessionNumber = body.session_number;
                const reason = typeof body.reason === "string" ? body.reason.trim() : "";
                if (!code || (sessionNumber !== 1 && sessionNumber !== 2) || !reason) {
                    return error(400, "invalid_request", "study_code, session_number (1|2) and reason are required");
                }
                const supabase = db();
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
                return json({ action: "reset_session", study_code: code, session_number: sessionNumber,
                              archived_session_record_id: data[0].id, slot_kept: data[0].slot });
            }

            default:
                return error(400, "unknown_action", "action must be add_codes, generate_codes or reset_session");
        }
    } catch (err: any) {
        console.error("admin action failed", body.action, err);
        return error(500, "db_error", err.message ?? String(err));
    }
});
