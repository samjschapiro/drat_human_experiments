/*
 * DAT — Divergent Association Task (Olson et al., 2021).
 * Participant types n_words single-word nouns "as different as possible".
 * One survey-html-form trial with a whole-test timer. Scored offline.
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
window.BATTERY_MODULES["dat"] = {
    id: "dat",
    buildTimeline(cfg, ctx) {
        const n = cfg.n_words || 10;
        const cd = ctx.makeCountdown(cfg.time_limit_sec,
            { onExpire: window.submitBatteryForm, tag: 1 });

        let fields = "";
        for (let i = 0; i < n; i++) {
            fields +=
                `<div style="margin:6px 0">` +
                `<label style="display:inline-block;width:24px;text-align:right">${i + 1}.</label> ` +
                `<input type="text" name="w${i}" autocomplete="off" spellcheck="false" ` +
                `style="font-size:16px;padding:6px 8px;width:240px"></div>`;
        }

        const intro = {
            type: jsPsychInstructions,
            pages: [cfg.intro_html],
            show_clickable_nav: true,
        };

        const task = {
            type: jsPsychSurveyHtmlForm,
            preamble: cd.html() +
                `<p style="text-align:center">Enter <b>${n}</b> nouns that are as ` +
                `different from each other as possible.</p>`,
            html: `<div style="text-align:center">${fields}</div>`,
            button_label: "Submit",
            data: { test: "dat", item_id: "dat_single", battery_tag: "task" },
            on_load: cd.start,
            on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
        };

        return [intro, task];
    },
};
