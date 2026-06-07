/*
 * Deployment config. Copy to js/config.js (gitignored) and fill in your values,
 * or let deploy.sh write it for you. core.js reads window.BATTERY_RUNTIME.
 *
 *   API_BASE       — your backend functions base URL, e.g.
 *                    https://<ref>.supabase.co/functions/v1
 *                    (the endpoints are ${API_BASE}/getSlot and /submitData)
 *   COMPLETION_URL — where to redirect on finish, e.g. the Prolific completion URL
 *
 * In local debug mode (no PROLIFIC_PID) nothing is submitted, so these are unused.
 */
window.BATTERY_RUNTIME = {
    API_BASE: "https://YOUR-REF.supabase.co/functions/v1",
    COMPLETION_URL: "https://app.prolific.com/submissions/complete?cc=XXXXXXXX",
};
