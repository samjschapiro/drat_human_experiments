window.STUDY_SESSIONS = window.STUDY_SESSIONS || {};

// Primary task instructions, aligned with the standard versions (Babak, 2026-10-15).
// Each Next button becomes active only after the reading delay.
const RULES_LIST = (rules) =>
    `<ul style="text-align:left;display:inline-block;margin:0">${rules.map((r) => `<li>${r}</li>`).join("")}</ul>`;

window.STUDY_INSTRUCTIONS = window.STUDY_INSTRUCTIONS || {};
window.STUDY_INSTRUCTIONS.dat = {
    intro_delay_sec: 20,
    intro_html: "<h2>Word Task</h2>" +
        "<p>On the next page, you will be asked to enter <b>10 words</b> that are " +
        "<b>as different from each other as possible</b>, in all meanings and uses of the words.</p>" +
        "<p><b>Rules:</b></p>" + RULES_LIST([
            "Only single words in English.",
            "Only nouns (e.g., things, objects, concepts).",
            "No proper nouns (e.g., no specific people or places).",
            "No specialized vocabulary (e.g., no technical terms).",
            "Think of the words on your own (e.g., do not just look at objects in your surroundings).",
        ]) +
        "<p>You will have 4 minutes. When you are ready to begin, press Next below when the button becomes active.</p>",
};
window.STUDY_INSTRUCTIONS.rat = {
    intro_delay_sec: 15,
    intro_html: "<h2>Word Connections</h2>" +
        "<p>On each screen you will see <b>three words</b>. Your task is to type the <b>single word</b> " +
        "that connects all three. The connecting word forms a compound word or a common phrase with " +
        "each of them, and it can come before or after each word.</p>" +
        // Example is CRA item 35, outside the 30 scored items (item 1, the old
        // cheese example, is scored).
        "<p>Example: <b>sleeping / bean / trash</b> &rarr; <b>bag</b> " +
        "(sleeping bag, beanbag, trash bag)</p>" +
        "<p>You will have 15 seconds for each set of words. If you have not answered when time runs out, " +
        "the task will move on to the next set. When you are ready, press Next.</p>",
};

window.STUDY_SESSIONS.buildSession1 = function buildSession1(ctx) {
    const timeline = [];
    for (const testId of ctx.order) {
        if (testId === "raven") {
            timeline.push(...window.STUDY_MODULES.raven(ctx));
            continue;
        }
        const cfg = { ...ctx.config.tests[testId], ...window.STUDY_INSTRUCTIONS[testId] };
        timeline.push(...window.BATTERY_MODULES[testId].buildTimeline(cfg, {
            ...ctx, itemBank: window.ITEM_BANKS[testId],
        }));
    }
    timeline.push(...window.STUDY_MODULES.bfi10());
    timeline.push(...window.STUDY_MODULES.demographics());
    return timeline;
};
