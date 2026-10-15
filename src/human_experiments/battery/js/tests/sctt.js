/*
 * SCTT — Scientific Creative Thinking Test (Cortes, Luchini, Green & Beaty, 2026).
 * Three subtests (research question / hypothesis / experiment). Each item shows a
 * scenario; the participant gives exactly n_responses_per_item free-text answers.
 * Parts run in a fixed order, each after its own instruction page. Self-paced.
 * Scored offline by the fine-tuned RoBERTa creativity model.
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
window.BATTERY_MODULES["sctt"] = {
    id: "sctt",
    buildTimeline(cfg, ctx) {
        const bank = ctx.itemBank || [];           // window.ITEM_BANKS.sctt
        const nResp = cfg.n_responses_per_item || 3;
        // Fixed part order (research question, hypothesis, experiment), each
        // part introduced by its own timed instruction page; the published item
        // order is kept within each part.
        const sections = cfg.sections;
        if (!Array.isArray(sections) || sections.length !== 3) {
            throw new Error("SCTT requires three section instruction pages");
        }
        const items = sections.flatMap((section) => bank.filter((item) => item.task === section.task));
        if (items.length !== bank.length) throw new Error("SCTT sections do not cover every item");

        const intro = window.timedInstructions(cfg.intro_html, cfg.intro_delay_sec);

        const trials = items.map((item, idx) => {
            const cd = ctx.makeCountdown(cfg.time_limit_sec,
                { onExpire: window.submitBatteryForm, tag: idx + 1 });
            let boxes = "";
            for (let r = 0; r < nResp; r++) {
                boxes +=
                    `<div style="margin:8px 0"><textarea name="r${r}" rows="2" ` +
                    `required ` +
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
                    presentation_index: idx,
                    prompt: item.prompt, battery_tag: "task",
                    displayed_stimuli: { prompt_html: item.prompt_html, task: item.task },
                },
                on_load: cd.start,
                on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
            };
        });

        const timeline = [intro];
        for (const section of sections) {
            timeline.push(window.timedInstructions(section.html, section.delay_sec));
            timeline.push(...trials.filter((trial) => trial.data.task === section.task));
        }
        return timeline;
    },
};
