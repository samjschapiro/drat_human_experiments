// GET /get-data  (Authorization: Bearer <DATA_EXPORT_TOKEN>)  — researchers only.
//
// Returns every study session (including researcher-reset attempts, flagged by
// reset_at) with its saved events in save order. The gateway's JWT check is off
// for this function (config.toml); the token check here is what protects the data.
//
// Reads in pages: Supabase caps a single select at 1000 rows, and a full study
// has ~15k events.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { CORS, db, error, json, requireResearcher } from "../_shared/common.ts";

const PAGE = 1000;

async function selectAll(table: string, columns: string, orderBy: string[]): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
        let query = db().from(table).select(columns);
        for (const column of orderBy) query = query.order(column, { ascending: true });
        const { data, error: err } = await query.range(from, from + PAGE - 1);
        if (err) throw err;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) return rows;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "GET") return error(405, "method_not_allowed", "GET required");
    const denied = requireResearcher(req);
    if (denied) return denied;

    try {
        const sessions = await selectAll("study_sessions",
            "id, study_code, session_number, slot, protocol_version, test_order, complete, " +
            "created_at, updated_at, completed_at, reset_at, reset_reason",
            ["created_at", "id"]);
        const events = await selectAll("study_events",
            "session_id, event_id, test_id, item_id, presentation_index, received_at, payload",
            ["received_at", "session_id", "event_id"]);

        const bySession = new Map<string, any[]>();
        for (const e of events) {
            if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
            bySession.get(e.session_id)!.push(e);
        }
        const out = sessions.map((s) => ({ ...s, events: bySession.get(s.id) ?? [] }));

        return json({
            status: "success",
            exported_at: new Date().toISOString(),
            n_sessions: out.length,
            n_events: events.length,
            sessions: out,
        });
    } catch (err: any) {
        console.error("export failed", err);
        return error(500, "db_error", err.message ?? String(err));
    }
});
