/*
 * Deployment settings. This committed copy is intentionally EMPTY: it is what
 * you get when opening index.html locally, which only runs in debug mode.
 * deploy.sh writes a filled-in copy (ENV, API_BASE, APP_VERSION) into the
 * per-environment staging folder .deploy/drat-<env>/ — never into this file.
 *
 * Nothing here is secret (the browser has to know the API URL anyway). Keys
 * that grant data access (service role, DATA_EXPORT_TOKEN) never go here.
 */
window.DEPLOY_CONFIG = {
    ENV: "",
    API_BASE: "",
    APP_VERSION: "",
};
