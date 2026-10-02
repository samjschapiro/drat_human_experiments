window.STUDY_SESSIONS = window.STUDY_SESSIONS || {};
window.STUDY_SESSIONS.buildSession1 = function buildSession1(ctx) {
    const timeline = [];
    for (const testId of ctx.order) {
        if (testId === "raven") {
            timeline.push(...window.STUDY_MODULES.raven(ctx));
            continue;
        }
        const cfg = { ...ctx.config.tests[testId] };
        if (testId === "dat") {
            cfg.intro_html = `<h2>Word Association</h2><p>Please enter 10 words that are as different from each other as possible, in all meanings and uses of the words.</p>
                <p>Rules: only single words; only nouns (things, objects, or concepts); no proper nouns; no specialized vocabulary; think of the words on your own rather than simply naming objects around you.</p>`;
        }
        timeline.push(...window.BATTERY_MODULES[testId].buildTimeline(cfg, {
            ...ctx, itemBank: window.ITEM_BANKS[testId],
        }));
    }
    timeline.push(...window.STUDY_MODULES.bfi10());
    timeline.push(...window.STUDY_MODULES.demographics());
    return timeline;
};
