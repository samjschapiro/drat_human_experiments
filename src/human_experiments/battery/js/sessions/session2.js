window.STUDY_SESSIONS = window.STUDY_SESSIONS || {};
window.STUDY_SESSIONS.buildSession2 = function buildSession2(ctx) {
    const assignment = window.STUDY_MATERIALS.assignments[ctx.slot];
    if (!assignment || assignment.blocks.length !== 8) throw new Error("Missing validated DRAT assignment");
    const rules = (items) =>
        `<ul style="text-align:left;display:inline-block;margin:0">${items.map((r) => `<li>${r}</li>`).join("")}</ul>`;
    // Instructions aligned with the standard versions (Babak, 2026-10-15); each
    // Next button becomes active only after the reading delay.
    const dratConfig = {
        n_words: 10,
        time_limit_sec: 120,
        intro_delay_sec: 30,
        intro_html: "<h2>Word Generation with Anchor Words</h2>" +
            "<p>On each screen you will see two or three <b>anchor words</b>. Your task is to enter " +
            "<b>10 nouns</b> that are <b>as different from each other as possible</b>, in all meanings and " +
            "uses of the words, while each noun still <b>relates to all of the anchor words</b>. A noun can " +
            "relate to the anchors in any way, literally or metaphorically.</p>" +
            "<p>Example: for the anchors <b>candle / romance / campfire</b>, two possible nouns are " +
            "<b>spark</b> (a candle is lit with a spark, a romance begins with a spark, a campfire throws " +
            "sparks) and <b>dinner</b> (a candlelit dinner, a romantic dinner, a campfire dinner). These two " +
            "nouns are very different in meaning, yet each relates to all three anchors. Your other nouns " +
            "should likewise be as different from each other as possible.</p>" +
            "<p><b>Rules:</b></p>" + rules([
                "Do not use different forms of the same word (e.g., not both \u201crun\u201d and \u201crunning\u201d).",
                "Only single words in English.",
                "Only nouns (e.g., things, objects, concepts).",
                "No proper nouns (e.g., no specific people, places, or brands).",
                "No specialized vocabulary (e.g., no technical terms).",
                "Do not use the anchor words or any form of them.",
            ]) +
            "<p>There are 8 sets of anchor words. Each set stays on screen for 2 minutes; the task will " +
            "advance automatically afterwards. You will first complete one practice set for 60 seconds.</p>" +
            "<p>When you are ready to begin, press Next below when the button becomes active.</p>",
        practice: { anchors: ["home", "journey"], time_limit_sec: 60 },
        post_practice_html: "<p>If anything about this task is still unclear after this practice, " +
            "<b>please raise your hand now</b>.</p><p>You can press Next &gt; when ready to start the main task.</p>",
    };
    const scttConfig = {
        ...ctx.config.tests.sctt,
        intro_delay_sec: 20,
        intro_html: "<h2>Science Scenarios</h2>" +
            "<p>In this task, you will think of creative ideas related to scientific problems. You will read " +
            "a series of short scenarios. For each one, type <b>three different responses</b> in the boxes provided.</p>" +
            "<p>The goal is to come up with ideas that are <b>original</b> (unusual, unique, innovative) while " +
            "also being <b>scientifically possible</b> (practical and feasible).</p>" +
            "<p>The task has three short sections. Take your time; it usually takes 20\u201330 minutes in total.</p>" +
            "<p>When you are ready to begin, press Next below when the button becomes active.</p>",
        sections: [
            { task: "research question", delay_sec: 8, html: "<h2>Part 1</h2><p>For each scenario, list " +
                "<b>three research questions</b> that are creative, different from each other, and scientifically testable.</p>" },
            { task: "hypothesis", delay_sec: 8, html: "<h2>Part 2</h2><p>For each scenario, list " +
                "<b>three hypotheses</b> (possible explanations) that are creative, different from each other, and scientifically plausible.</p>" },
            { task: "experiment", delay_sec: 8, html: "<h2>Part 3</h2><p>For each scenario, describe " +
                "<b>three ways to test the claim</b> that are creative, different from each other, and feasible.</p>" },
        ],
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
    timeline.push(...window.BATTERY_MODULES.sctt.buildTimeline(scttConfig, {
        ...ctx, itemBank: window.ITEM_BANKS.sctt,
    }));
    return timeline;
};
