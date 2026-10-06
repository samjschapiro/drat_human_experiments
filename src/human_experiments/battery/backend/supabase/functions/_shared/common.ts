// Shared helpers for the study Edge Functions.
//
// Privacy: nothing here reads or stores the client's IP address or user agent.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import manifest from "./study_manifest.json" with { type: "json" };

export const MANIFEST = manifest as {
    protocol_version: string;
    n_slots: number;
    session1_orders: string[][];
    session2_order: string[];
    session1_items: Record<string, string[]>;
    session2_items: Record<string, string[]>;
    drat_by_slot: string[][];
};

// Same rule as the frontend's study-code.js.
export const STUDY_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const MAX_EVENT_BYTES = 64 * 1024;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function db(): SupabaseClient {
    return createClient(SUPABASE_URL, SERVICE_KEY);
}

export const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

export function error(status: number, code: string, message: string, extra: object = {}): Response {
    return json({ error: code, message, ...extra }, status);
}

export function bearer(req: Request): string {
    const auth = req.headers.get("authorization") ?? "";
    return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Constant-time comparison so response timing doesn't leak the token.
function tokenMatches(given: string, expected: string): boolean {
    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

// Researcher-only endpoints (get-data, admin) require DATA_EXPORT_TOKEN.
// Returns an error Response to send, or null when authorized.
export function requireResearcher(req: Request): Response | null {
    const expected = Deno.env.get("DATA_EXPORT_TOKEN");
    if (!expected) {
        console.error("DATA_EXPORT_TOKEN secret is not set; refusing all researcher requests");
        return error(500, "not_configured", "export token not configured");
    }
    if (!tokenMatches(bearer(req), expected)) return error(401, "unauthorized", "unauthorized");
    return null;
}

export function normalizeCode(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    return STUDY_CODE_RE.test(code) ? code : null;
}

// Exact item IDs a session must contain, keyed by item_id -> test_id.
export function expectedItems(sessionNumber: number, slot: number): Map<string, string> {
    const items = new Map<string, string>();
    const groups = sessionNumber === 1 ? MANIFEST.session1_items : MANIFEST.session2_items;
    for (const [testId, ids] of Object.entries(groups)) for (const id of ids) items.set(id, testId);
    if (sessionNumber === 2) for (const id of MANIFEST.drat_by_slot[slot]) items.set(id, "drat");
    return items;
}

export interface SessionRow {
    id: string;
    study_code: string;
    session_number: number;
    slot: number;
    test_order: string[];
    complete: boolean;
    reset_at: string | null;
}

// Look up the active session that a browser's bearer token belongs to.
export async function sessionForToken(req: Request): Promise<SessionRow | Response> {
    const token = bearer(req);
    if (!token) return error(401, "missing_token", "session token required");
    const { data, error: err } = await db()
        .from("study_sessions")
        .select("id, study_code, session_number, slot, test_order, complete, reset_at")
        .eq("session_token_hash", await sha256Hex(token))
        .is("reset_at", null)
        .maybeSingle();
    if (err) {
        console.error("session lookup failed", err);
        return error(500, "db_error", err.message);
    }
    if (!data) {
        return error(401, "invalid_token",
            "This session was reopened on another computer or reset by a researcher. Ask a researcher for help.");
    }
    return data as SessionRow;
}
