/*
 * Deployment settings, written by deploy.sh (or edited by hand). Committed on
 * purpose: nothing here is secret — the browser has to know the API URL anyway.
 * Keys that grant data access (service role, DATA_EXPORT_TOKEN) never go here.
 *
 *   API_BASE        e.g. "https://<project-ref>.supabase.co/functions/v1"
 *   COMPLETION_URL  where to send the participant after a successful submit
 *
 * Leave API_BASE empty to run only in debug mode (no PROLIFIC_PID in the URL);
 * core.js refuses to start a real session while it is empty.
 */
window.DEPLOY_CONFIG = {
    API_BASE: "https://lvrspzwomnsxyoxptjlh.supabase.co/functions/v1",
    COMPLETION_URL: "https://example.com/done",
};
