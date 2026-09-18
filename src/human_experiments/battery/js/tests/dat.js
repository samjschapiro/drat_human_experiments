/*
 * DAT — Divergent Association Task (Olson et al., 2021).
 * Participant types n_words single-word nouns "as different as possible".
 * One survey-html-form trial with a whole-test timer. Scored offline.
 *
 * Module contract (see core.js): { id, title, eyebrow, color, intro(cfg, ctx),
 * example(cfg, ctx), buildTrials(cfg, ctx) }. All participant-facing wording
 * lives here, in the Kombine study's format and voice.
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
const DAT = {
    id: "dat",
    title: "Different Words Task",
    eyebrow: "different words",
    color: "#1976d2",
    rules: "Use single words, and only nouns \u2014 no names of people, places or brands, " +
           "and no technical terms.",

    intro(cfg, ctx) {
        const n = cfg.n_words || 10;
        return `In this task, we will ask you to type <b>${n} words</b> that are <b>as different ` +
            `from each other as possible</b>, in every sense of the words. ${DAT.rules} The less ` +
            `your words have to do with each other, the higher your score. ` +
            `${ctx.timing(cfg.time_limit_sec)}`;
    },

    buildTrials(cfg, ctx) {
        const n = cfg.n_words || 10;
        const start = ctx.itemStart;
        const cd = ctx.makeCountdown(cfg.time_limit_sec,
            { onExpire: window.submitBatteryForm, tag: 1 });

        const task = {
            type: jsPsychSurveyHtmlForm,
            html: () => ctx.wrap(
                ctx.header(start) + cd.html() +
                `<div class="kb-eyebrow" style="color:${DAT.color}">${DAT.eyebrow}</div>` +
                `<p class="kb-ask">Type <b>${n} words</b> that are as different from each other ` +
                `as possible, one per box.</p>` +
                ctx.wordGrid(n)
            ),
            button_label: "Submit",
            data: { test: "dat", item_id: "dat_single", battery_tag: "task" },
            on_load: () => { cd.start(); ctx.wireCells(); },
            on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
        };

        return [task];
    },
};
window.BATTERY_MODULES["dat"] = DAT;
