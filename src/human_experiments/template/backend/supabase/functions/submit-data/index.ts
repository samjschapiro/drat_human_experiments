// Supabase Edge Function: persists one submission per completed session.
//
// Wire as POST /functions/v1/submit-data with JSON body:
//   { participant_id: str, slot: int, ratings: [...], client_metadata: {...} }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "POST required" }),
            { status: 405, headers: cors }
        );
    }

    let body: any;
    try { body = await req.json(); }
    catch {
        return new Response(
            JSON.stringify({ error: "invalid JSON" }),
            { status: 400, headers: cors }
        );
    }

    if (!body.participant_id) {
        return new Response(
            JSON.stringify({ error: "participant_id required" }),
            { status: 400, headers: cors }
        );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data, error } = await supabase.from("submissions").insert({
        participant_id: body.participant_id,
        slot:           body.slot ?? null,
        payload:        body,
        user_agent:     req.headers.get("user-agent") ?? null,
        source_ip:      req.headers.get("x-forwarded-for") ?? null,
    }).select("id, submitted_at").single();

    if (error) {
        console.error("insert failed", error);
        return new Response(
            JSON.stringify({ status: "error", error: error.message }),
            { status: 500, headers: cors }
        );
    }

    return new Response(JSON.stringify({
        status:        "success",
        submission_id: data.id,
        submitted_at:  data.submitted_at,
    }), { status: 200, headers: cors });
});
