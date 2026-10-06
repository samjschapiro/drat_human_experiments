// Supabase Edge Function: admin batch retrieval of all submissions.
//
// Wire as GET /functions/v1/get-data
// Requires `Authorization: Bearer <DATA_EXPORT_TOKEN>`, where DATA_EXPORT_TOKEN
// is a Supabase function secret (`supabase secrets set DATA_EXPORT_TOKEN=...`).
// The gateway's JWT check is off for this function (config.toml), so this
// in-function check is the only thing standing between the data and the web.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPORT_TOKEN = Deno.env.get("DATA_EXPORT_TOKEN");

// Constant-time comparison so response timing doesn't leak the token.
function tokenMatches(given: string, expected: string): boolean {
    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type":                 "application/json",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    if (!EXPORT_TOKEN) {
        console.error("DATA_EXPORT_TOKEN secret is not set; refusing all requests");
        return new Response(
            JSON.stringify({ status: "error", error: "export token not configured" }),
            { status: 500, headers: cors }
        );
    }
    const auth = req.headers.get("authorization") ?? "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!tokenMatches(given, EXPORT_TOKEN)) {
        return new Response(
            JSON.stringify({ status: "error", error: "unauthorized" }),
            { status: 401, headers: cors }
        );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data, error } = await supabase
        .from("submissions")
        .select("id, participant_id, slot, payload, submitted_at")
        .order("submitted_at", { ascending: true });

    if (error) {
        console.error("query failed", error);
        return new Response(
            JSON.stringify({ status: "error", error: error.message }),
            { status: 500, headers: cors }
        );
    }

    // Flatten the per-session `responses` array into a row-per-response
    // structure. Each response is one test trial (DAT/RAT/SCTT/DRAT); its
    // `response` field is an object (form fields), JSON-stringified by the
    // pandas step in get_data.sh. Offline scoring reads raw_data for full
    // fidelity; this CSV view is for quick inspection.
    const csvRows: any[] = [];
    const participants = new Set<string>();
    for (const row of data ?? []) {
        participants.add(row.participant_id);
        const payload = row.payload as any;
        const responses = payload?.responses ?? [];
        for (const r of responses) {
            csvRows.push({
                participant_id:       row.participant_id,
                slot:                 row.slot,
                order_index:          payload?.order_index ?? null,
                anchor_set_index:     payload?.anchor_set_index ?? null,
                submission_timestamp: row.submitted_at,
                ...r,
            });
        }
    }

    return new Response(JSON.stringify({
        status:          "success",
        participants:    participants.size,
        total_responses: csvRows.length,
        csv_data:        csvRows,
        raw_data:        data,
    }), { status: 200, headers: cors });
});
