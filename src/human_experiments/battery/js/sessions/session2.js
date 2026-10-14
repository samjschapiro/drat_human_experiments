window.STUDY_SESSIONS = window.STUDY_SESSIONS || {};
window.STUDY_SESSIONS.buildSession2 = function buildSession2(ctx) {
    const assignment = window.STUDY_MATERIALS.assignments[ctx.slot];
    if (!assignment || assignment.blocks.length !== 8) throw new Error("Missing validated DRAT assignment");
    const dratConfig = {
        n_words: 10,
        time_limit_sec: 120,
        // Paraphrased for participants from the DRAT prompt in Schapiro et al.
        // (arXiv:2605.13450, Fig. 8) plus the DAT rules (App. E.1); wording per
        // the 2026-10-13 meeting: "as different as possible from each other,
        // but still related to the anchors".
        intro_html: "<h2>Word generation with anchor words</h2>" +
            "<p>On each screen you will see two or three <b>anchor words</b>. Type up to <b>10 nouns</b> " +
            "that are <b>as different as possible from each other</b>, but where each noun is still " +
            "<b>related to the anchor words</b>. A noun can relate to the anchors in any way, including metaphorically.</p>" +
            "<p>Rules: only single words; only nouns (things, objects, or concepts); no proper nouns " +
            "(names, places, brands); do not use the anchor words themselves; do not use variations of " +
            "the same word (for example, not both \u2018run\u2019 and \u2018running\u2019).</p>" +
            "<p>There are 8 sets of anchor words. Each set stays on screen for the full two minutes " +
            "and then moves on automatically.</p>",
    };
    const timeline = window.BATTERY_MODULES.drat.buildTimeline(dratConfig, {
        ...ctx, assignmentBlocks: assignment.blocks,
    });
    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: "<h2>Short break</h2><p>Take a short break. Continue when you are ready.</p>",
        choices: ["Continue"],
        data: { test: "break", item_id: "session2_break", battery_tag: "task",
                displayed_stimuli: { short_break: true } },
    });
    timeline.push(...window.STUDY_MODULES.orangeCheck());
    timeline.push(...window.BATTERY_MODULES.sctt.buildTimeline(ctx.config.tests.sctt, {
        ...ctx, itemBank: window.ITEM_BANKS.sctt,
    }));
    return timeline;
};
