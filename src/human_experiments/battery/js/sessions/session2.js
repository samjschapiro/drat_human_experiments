window.STUDY_SESSIONS = window.STUDY_SESSIONS || {};
window.STUDY_SESSIONS.buildSession2 = function buildSession2(ctx) {
    const assignment = window.STUDY_MATERIALS.assignments[ctx.slot];
    if (!assignment || assignment.blocks.length !== 8) throw new Error("Missing validated DRAT assignment");
    const dratConfig = {
        n_words: 10,
        time_limit_sec: 120,
        intro_html: "<h2>Creative word generation</h2><p>For each set of anchor words, enter up to 10 single-word nouns. Each response should relate to all of the anchors while being as different as possible from your other responses. You have two minutes per set.</p>",
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
