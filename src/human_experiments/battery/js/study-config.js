// Local study-flow configuration. Production values require Babak's approval.
window.STUDY_CONFIG = {
    protocolVersion: "drat-human-2026-v1",
    // false: a deployed dev site saves to its Supabase backend. Prod stays locked in core.js.
    localPreviewOnly: false,
    session1Orders: [
        ["dat", "rat", "raven"],
        ["dat", "raven", "rat"],
        ["rat", "dat", "raven"],
        ["rat", "raven", "dat"],
        ["raven", "dat", "rat"],
        ["raven", "rat", "dat"],
    ],
    ravenUrl: "", // Pearson Q-global URL; supplied by the study team later.
};
