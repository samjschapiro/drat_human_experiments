// Shared helpers for the study Edge Functions.
//
// Privacy: nothing here reads or stores the client's IP address or user agent.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import manifest from "./study_manifest.json" with { type: "json" };

export const MANIFEST = manifest as {
    protocol_version: string;
    consent_version: string;
    n_slots: number;
    session1_orders: string[][];
    session2_order: string[];
    session1_items: Record<string, string[]>;
    session2_items: Record<string, string[]>;
    session2_optional_items: Record<string, string[]>;
    drat_by_slot: string[][];
};

// Internal participant codes (minted per email, or loaded by researchers).
export const STUDY_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
// Same rule as the frontend's study-code.js and the participants table check.
export const EMAIL_RE = /^[a-z0-9][a-z0-9._%+-]{0,63}@stonybrook\.edu$/;
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
export function tokenMatches(given: string, expected: string): boolean {
    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

function secret(name: string): string | null {
    const value = Deno.env.get(name);
    if (!value) console.error(`${name} secret is not set; refusing researcher requests`);
    return value || null;
}

// Researcher emails allowed into the admin panel (RESEARCHER_EMAILS secret,
// comma-separated, from .env.<env>).
export function researcherEmails(): Set<string> {
    return new Set((Deno.env.get("RESEARCHER_EMAILS") ?? "")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

const ADMIN_TOKEN_HOURS = 12;

async function hmacHex(key: string, text: string): Promise<string> {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Admin-panel login token: "adm.<base64url(email|expiry)>.<hmac>", signed with
// DATA_EXPORT_TOKEN, so no server-side session table is needed.
export async function issueAdminToken(email: string): Promise<{ token: string; expires_at: string }> {
    const key = secret("DATA_EXPORT_TOKEN");
    if (!key) throw new Error("export token not configured");
    const expires = Date.now() + ADMIN_TOKEN_HOURS * 3600 * 1000;
    const payload = btoa(`${email}|${expires}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return { token: `adm.${payload}.${await hmacHex(key, payload)}`, expires_at: new Date(expires).toISOString() };
}

async function adminTokenEmail(token: string, key: string): Promise<string | null> {
    const [prefix, payload, sig] = token.split(".");
    if (prefix !== "adm" || !payload || !sig) return null;
    if (!tokenMatches(sig, await hmacHex(key, payload))) return null;
    const [email, expires] = atob(payload.replace(/-/g, "+").replace(/_/g, "/")).split("|");
    if (!(Number(expires) > Date.now())) return null;
    // Removing an email from RESEARCHER_EMAILS revokes its tokens on the next redeploy.
    return researcherEmails().has(email) ? email : null;
}

// Researcher-only endpoints (get-data, admin). Accepts DATA_EXPORT_TOKEN
// (scripts: admin.sh, get_data.sh) or an admin-panel login token. Returns the
// researcher identity, or an error Response to send.
export async function requireResearcher(req: Request): Promise<{ researcher: string } | Response> {
    const expected = secret("DATA_EXPORT_TOKEN");
    if (!expected) return error(500, "not_configured", "export token not configured");
    const given = bearer(req);
    if (tokenMatches(given, expected)) return { researcher: "researcher-key" };
    const email = await adminTokenEmail(given, expected);
    if (email) return { researcher: email };
    return error(401, "unauthorized", "unauthorized");
}

// Admin-panel login: an allowlisted researcher email plus ADMIN_PASSWORD.
export function checkAdminLogin(email: string, password: string): "ok" | "denied" | "not_configured" {
    const expected = secret("ADMIN_PASSWORD");
    if (!expected || researcherEmails().size === 0) return "not_configured";
    const passwordOk = tokenMatches(password, expected);
    return passwordOk && researcherEmails().has(email) ? "ok" : "denied";
}

export function normalizeCode(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    return STUDY_CODE_RE.test(code) ? code : null;
}

export function normalizeEmail(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const email = raw.trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
}

// No 0/O/1/I/L, so codes survive being read aloud or handwritten.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(prefix: string, length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return `${prefix}-` + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// Exact item IDs a session must contain, keyed by item_id -> test_id.
export function expectedItems(sessionNumber: number, slot: number): Map<string, string> {
    const items = new Map<string, string>();
    const groups = sessionNumber === 1 ? MANIFEST.session1_items : MANIFEST.session2_items;
    for (const [testId, ids] of Object.entries(groups)) for (const id of ids) items.set(id, testId);
    if (sessionNumber === 2) for (const id of MANIFEST.drat_by_slot[slot]) items.set(id, "drat");
    return items;
}

// Items a session may save but does not need to finish (e.g. the DRAT practice).
export function optionalItems(sessionNumber: number): Map<string, string> {
    const items = new Map<string, string>();
    if (sessionNumber !== 2) return items;
    for (const [testId, ids] of Object.entries(MANIFEST.session2_optional_items)) {
        for (const id of ids) items.set(id, testId);
    }
    return items;
}

export interface SessionRow {
    id: string;
    study_code: string;
    session_number: number;
    slot: number;
    test_order: string[];
    lab_meeting_order_index: number | null;
    order_source: "lab-meeting-url" | "session-2-fixed";
    consent_version: string | null;
    consent_accepted_at: string | null;
    complete: boolean;
    reset_at: string | null;
}

// Look up the active session that a browser's bearer token belongs to.
export async function sessionForToken(req: Request): Promise<SessionRow | Response> {
    const token = bearer(req);
    if (!token) return error(401, "missing_token", "session token required");
    const { data, error: err } = await db()
        .from("study_sessions")
        .select("id, study_code, session_number, slot, test_order, lab_meeting_order_index, " +
                "order_source, consent_version, consent_accepted_at, complete, reset_at")
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
    return data as unknown as SessionRow;
}
