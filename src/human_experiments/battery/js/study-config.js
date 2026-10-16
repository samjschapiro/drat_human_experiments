// Study-flow configuration. The Pearson group code is set in /admin, not here.
window.STUDY_CONFIG = {
    protocolVersion: "drat-human-2026-v2",
    // false: a deployed site saves to its Supabase backend. true: data stays in the browser
    // (deploy.sh then publishes the frontend only, and refuses prod).
    localPreviewOnly: false,
    consentPdfUrl: "assets/Consent_DRAT_v3_tracked.pdf",
    consentVersion: "Consent_DRAT_v3_tracked",
    session1Orders: [
        ["dat", "rat", "raven"],
        ["dat", "raven", "rat"],
        ["rat", "dat", "raven"],
        ["rat", "raven", "dat"],
        ["raven", "dat", "rat"],
        ["raven", "rat", "dat"],
    ],
    ravenUrl: "https://qglobal.pearsonassessments.com/qg/selfRegisterLogin.seam",
};

window.resolveSession1OrderIndex = function resolveSession1OrderIndex(search) {
    const raw = new URLSearchParams(search).get("order");
    const count = window.STUDY_CONFIG.session1Orders.length;
    if (!new RegExp(`^[1-${count}]$`).test(raw || "")) {
        throw new Error(`Session 1 requires an order parameter from 1 to ${count}.`);
    }
    return Number(raw) - 1;
};
