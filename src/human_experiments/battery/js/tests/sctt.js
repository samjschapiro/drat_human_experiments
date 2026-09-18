/*
 * SCTT — Scientific Creative Thinking Test (Cortes, Luchini, Green & Beaty, 2026).
 * Three subtests (research question / hypothesis / experiment). Each item shows a
 * scenario; the participant gives exactly n_responses_per_item free-text answers.
 * Self-paced by default. Scored offline by the fine-tuned RoBERTa creativity model.
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
const SCTT = {
    id: "sctt",
    title: "Science Ideas Task",
    eyebrow: "science ideas",
    color: "#388e3c",
    intro(cfg, ctx) {
        const n = (ctx.itemBank || []).length;
        const nr = cfg.n_responses_per_item || 3;
        return `In this task, we will show you ${n} short situations, each about an everyday ` +
            `question that science could answer, and ask you for <b>${nr} different ideas</b> ` +
            `about each: a question worth looking into, a possible explanation, or a way to ` +
            `test something. You do not need any scientific training, and there are no right ` +
            `or wrong answers. Each idea is scored on how original it is and how well it fits ` +
            `the situation, by a program trained on human ratings, so only the quality of your ` +
            `ideas counts, not how long they are. ` +
            `${ctx.timing(cfg.time_limit_sec, "situation")}`;
    },

    example(cfg, ctx) {
        const ideas = [
            "The glass warms the side facing it, so cells on that side grow faster and push the stem over",
            "Vibrations from traffic through the wall tilt them a little more each day",
            "The room air is drier than the air by the window, so they lean away from it",
        ];
        return `<div class="kb-stim">You notice that the plants on your windowsill all lean ` +
            `toward the glass. <b>What hypotheses do you have about why that is?</b></div>` +
            ideas.map((t, i) =>
                `<div class="kb-field"><label>Idea ${i + 1}</label>` +
                `<textarea rows="1" readonly>${ctx.esc(t)}</textarea></div>`).join("");
    },

    buildTrials(cfg, ctx) {
        const bank = ctx.itemBank || [];           // window.ITEM_BANKS.sctt
        const nResp = cfg.n_responses_per_item || 3;
        // Per-participant item order, seeded by slot.
        const items = ctx.seededShuffle(bank, ctx.slot * 17 + 3);
        const start = ctx.itemStart;

        return items.map((item, idx) => {
            const cd = ctx.makeCountdown(cfg.time_limit_sec,
                { onExpire: window.submitBatteryForm, tag: idx + 1 });
            let boxes = "";
            for (let r = 0; r < nResp; r++) {
                boxes += `<div class="kb-field"><label for="sctt-r${r}">Idea ${r + 1}</label>` +
                         `<textarea id="sctt-r${r}" name="r${r}" rows="2"></textarea></div>`;
            }
            return {
                type: jsPsychSurveyHtmlForm,
                html: () => ctx.wrap(
                    ctx.header(start + idx) + cd.html() +
                    `<div class="kb-eyebrow" style="color:${SCTT.color}">${SCTT.eyebrow}</div>` +
                    `<div class="kb-stim">${item.prompt_html}</div>` +
                    `<p class="kb-ask">Type <b>${nResp} different ideas</b>, one in each box.</p>` +
                    boxes +
                    ctx.exampleBlock(SCTT.example(cfg, ctx))
                ),
                button_label: "Next",
                // task + prompt are carried through for the offline scorer's input rows.
                data: {
                    test: "sctt", item_id: item.item_id, task: item.task,
                    prompt: item.prompt, battery_tag: "task",
                },
                on_load: () => { cd.start(); ctx.wireCells(); },
                on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
            };
        });
    },
};
window.BATTERY_MODULES["sctt"] = SCTT;
