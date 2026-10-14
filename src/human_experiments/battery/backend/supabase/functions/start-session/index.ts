// POST /start-session
//   { protocol_version, email, session_number, session1_order_index,
//     consent_version, consent_accepted_at }
//
// Starts or resumes a visit for a Stony Brook email. The email is mapped to an
// internal study code (participants table); everything else is keyed by that
// code, which is returned to the browser. The server is authoritative for the
// slot, persisted meeting order and Visit 1 -> 2 gate.
//
// Consent: Visit 1 may be requested without consent. If the email already has
// an active Visit 1 it resumes (consent was recorded the first time);
// otherwise the reply is consent_required and the browser asks for consent and
// calls again. A new participant is only created once consent is given.
// Visit 2 only accepts an email that already has a participant record, so a
// typo cannot silently start a new person.
//
// Every call issues a fresh session token (only its hash is stored), so
// re-entering the email on another computer resumes there and invalidates
// the old tab. Returns the item IDs already saved so the browser can skip them.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS, MANIFEST, db, error, json, normalizeEmail, randomCode, randomToken, sha256Hex } from "../_shared/common.ts";

const STATUS_ERRORS: Record<string, [number, string]> = {
    session1_incomplete: [409, "Visit 2 can only start after Visit 1 is complete for this email."],
    slots_full: [409, "No study slots are left. Tell a researcher."],
    order_mismatch: [409, "This email already started Visit 1 with a different meeting-order URL."],
    invalid_start: [400, "The visit start details are incomplete."],
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
    const email = normalizeEmail(body.email);
    if (!email) return error(400, "invalid_email", "Enter your Stony Brook email (name@stonybrook.edu).");
    const sessionNumber = body.session_number;
    if (sessionNumber !== 1 && sessionNumber !== 2) {
        return error(400, "invalid_session", "session_number must be 1 or 2");
    }
    let orderIndex: number | null = null;
    let consentVersion: string | null = null;
    let consentAcceptedAt: string | null = null;
    if (sessionNumber === 1) {
        const requestedOrder = body.session1_order_index;
        if (!Number.isInteger(requestedOrder) || requestedOrder < 0 ||
            requestedOrder >= MANIFEST.session1_orders.length) {
            return error(400, "invalid_order", "Visit 1 requires a meeting order from 1 to 6.");
        }
        orderIndex = requestedOrder;
        if (body.consent_version != null || body.consent_accepted_at != null) {
            consentVersion = body.consent_version;
            consentAcceptedAt = body.consent_accepted_at;
            if (consentVersion !== MANIFEST.consent_version || typeof consentAcceptedAt !== "string" ||
                Number.isNaN(Date.parse(consentAcceptedAt))) {
                return error(400, "invalid_consent", "Consent must be accepted before Visit 1 starts.");
            }
        }
    }
    const hasConsent = consentVersion !== null;
    const consentRequired = () => error(409, "consent_required", "Consent is required before Visit 1 starts.");

    const supabase = db();
    const { data: code, error: codeErr } = await supabase.rpc("participant_code", {
        p_email: email,
        p_new_code: randomCode("P", 8),
        p_create: sessionNumber === 1 && hasConsent,
    });
    if (codeErr) {
        console.error("participant_code failed", codeErr.message);
        return error(500, "db_error", codeErr.message);
    }
    if (!code) {
        return sessionNumber === 1 ? consentRequired()
            : error(404, "unknown_email",
                "No Visit 1 was found for this email. Check the spelling, or ask a researcher.");
    }

    const token = randomToken();
    const { data, error: err } = await supabase.rpc("start_session", {
        p_code: code,
        p_session_number: sessionNumber,
        p_token_hash: await sha256Hex(token),
        p_protocol: MANIFEST.protocol_version,
        p_session1_order: orderIndex === null ? null : MANIFEST.session1_orders[orderIndex],
        p_order_index: orderIndex,
        p_consent_version: consentVersion,
        p_consent_accepted_at: consentAcceptedAt,
        p_session2_order: MANIFEST.session2_order,
    });
    if (err) {
        console.error("start_session failed", err);
        return error(500, "db_error", err.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row.status === "invalid_start" && sessionNumber === 1 && !hasConsent) return consentRequired();
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
        lab_meeting_order_index: row.lab_meeting_order_index,
        order_source: row.order_source,
        consent_version: row.consent_version,
        consent_accepted_at: row.consent_accepted_at,
        saved_item_ids: (events ?? []).map((e: any) => e.item_id),
        complete: row.complete,
        status: row.status,          // started | resumed | complete
    });
});
