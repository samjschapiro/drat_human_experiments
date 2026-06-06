// Supabase Edge Function: assigns a balanced slot to a participant.
//
// Wire as GET /functions/v1/get-slot?PROLIFIC_PID=...
// (or POST with { participant_id } in body).
//
// Calls the claim_slot() Postgres function which atomically picks the
// lowest-numbered unclaimed slot via FOR UPDATE SKIP LOCKED. Idempotent
// per participant_id.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOTAL_SLOTS  = Number(Deno.env.get("TOTAL_SLOTS") ?? 40);

const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type":                 "application/json",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    let participantId: string | null = null;
    const url = new URL(req.url);
    participantId = url.searchParams.get("PROLIFIC_PID");
    if (!participantId && req.method === "POST") {
        try {
            const body = await req.json();
            participantId = body.participant_id;
        } catch { /* fall through */ }
    }

    if (!participantId) {
        return new Response(
            JSON.stringify({ error: "participant_id required" }),
            { status: 400, headers: cors }
        );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data, error } = await supabase.rpc("claim_slot", {
        p_participant_id: participantId,
    });

    if (error) {
        console.error("claim_slot failed", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: cors }
        );
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.slot_id === -1) {
        return new Response(
            JSON.stringify({ error: "all slots taken" }),
            { status: 409, headers: cors }
        );
    }

    return new Response(JSON.stringify({
        slot:         row.slot_id,
        total_slots:  TOTAL_SLOTS,
        status:       row.status,    // 'existing' | 'assigned'
    }), { status: 200, headers: cors });
});
