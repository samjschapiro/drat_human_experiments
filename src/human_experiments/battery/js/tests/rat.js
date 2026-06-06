/*
 * RAT — Remote Associates Test (Bowden & Jung-Beeman, 2003, CRA set).
 * Each item: 3 cue words → type the one connecting word. Per-item timer.
 * Accuracy scored offline against the answer key (kept server-side).
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
window.BATTERY_MODULES["rat"] = {
    id: "rat",
    buildTimeline(cfg, ctx) {
        const bank = ctx.itemBank || [];           // window.ITEM_BANKS.rat (cues only)
        // Per-participant item order (seeded by slot so it's reproducible).
        const items = ctx.seededShuffle(bank, ctx.slot * 31 + 7);

        const intro = {
            type: jsPsychInstructions,
            pages: [cfg.intro_html],
            show_clickable_nav: true,
        };

        const trials = items.map((item, idx) => {
            const cd = ctx.makeCountdown(cfg.item_time_limit_sec,
                { onExpire: window.submitBatteryForm, tag: idx + 1 });
            const cues = item.cues
                .map((c) => `<span style="display:inline-block;margin:0 14px;` +
                            `font-size:26px;font-weight:700;letter-spacing:.5px">${c}</span>`)
                .join("");
            return {
                type: jsPsychSurveyText,
                preamble: cd.html() +
                    `<div style="text-align:center;margin:18px 0">${cues}</div>`,
                questions: [{
                    prompt: "What single word connects all three?",
                    name: "answer", required: false, columns: 24,
                }],
                button_label: "Submit",
                data: { test: "rat", item_id: item.item_id, battery_tag: "task" },
                on_load: cd.start,
                on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
            };
        });

        return [intro, ...trials];
    },
};
