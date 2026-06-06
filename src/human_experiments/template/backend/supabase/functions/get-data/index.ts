// Supabase Edge Function: admin batch retrieval of all submissions.
//
// Wire as GET /functions/v1/get-data
// Requires an Authorization header with the service-role JWT in production.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type":                 "application/json",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

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

    // Flatten ratings array into a CSV-friendly structure, matching the
    // shape that the original AWS get-data endpoint returned. This keeps
    // analysis scripts swap-compatible across backends.
    const csvRows: any[] = [];
    const participants = new Set<string>();
    for (const row of data ?? []) {
        participants.add(row.participant_id);
        const ratings = (row.payload as any)?.ratings ?? [];
        for (const r of ratings) {
            csvRows.push({
                participant_id:       row.participant_id,
                slot:                 row.slot,
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
