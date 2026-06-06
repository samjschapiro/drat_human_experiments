/*
 * SCTT — Scientific Creative Thinking Test (Cortes, Luchini, Green & Beaty, 2026).
 * Three subtests (research question / hypothesis / experiment). Each item shows a
 * scenario; the participant gives exactly n_responses_per_item free-text answers.
 * Self-paced by default. Scored offline by the fine-tuned RoBERTa creativity model.
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
window.BATTERY_MODULES["sctt"] = {
    id: "sctt",
    buildTimeline(cfg, ctx) {
        const bank = ctx.itemBank || [];           // window.ITEM_BANKS.sctt
        const nResp = cfg.n_responses_per_item || 3;
        // Per-participant item order, seeded by slot.
        const items = ctx.seededShuffle(bank, ctx.slot * 17 + 3);

        const intro = {
            type: jsPsychInstructions,
            pages: [cfg.intro_html],
            show_clickable_nav: true,
        };

        const trials = items.map((item, idx) => {
            const cd = ctx.makeCountdown(cfg.time_limit_sec,
                { onExpire: window.submitBatteryForm, tag: idx + 1 });
            let boxes = "";
            for (let r = 0; r < nResp; r++) {
                boxes +=
                    `<div style="margin:8px 0"><textarea name="r${r}" rows="2" ` +
                    `style="width:90%;font-size:15px;padding:6px" ` +
                    `placeholder="Response ${r + 1}"></textarea></div>`;
            }
            return {
                type: jsPsychSurveyHtmlForm,
                preamble: cd.html() +
                    `<div style="font-size:18px;margin:10px 0 4px">${item.prompt_html}</div>` +
                    `<p style="color:#555">Give ${nResp} responses.</p>`,
                html: `<div style="text-align:center">${boxes}</div>`,
                button_label: "Next",
                // task + prompt are carried through for the offline scorer's input rows.
                data: {
                    test: "sctt", item_id: item.item_id, task: item.task,
                    prompt: item.prompt, battery_tag: "task",
                },
                on_load: cd.start,
                on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
            };
        });

        return [intro, ...trials];
    },
};
