/*
 * DRAT — Divergent Remote Association Task (Schapiro, Gladstone, Black & Ji, 2026).
 * Participant types n_words nouns that are (a) maximally different from each other
 * AND (b) each relatable to the k anchor words shown. The anchor set is chosen by
 * the participant's slot (ctx.anchorSetIndex). Scored offline (utility threshold +
 * DAT-style pairwise distance over surviving words).
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
window.BATTERY_MODULES["drat"] = {
    id: "drat",
    buildTimeline(cfg, ctx) {
        const n = cfg.n_words || 10;
        const drat = (window.ITEM_BANKS && window.ITEM_BANKS.drat) || { anchor_sets: [] };
        const sets = drat.anchor_sets || [];
        if (sets.length === 0) {
            return [{
                type: jsPsychHtmlButtonResponse,
                stimulus: "<p>DRAT is enabled but no anchor sets are defined. " +
                          "Add item_banks/drat_anchors.json and rebuild.</p>",
                choices: ["Continue"],
            }];
        }
        const set = sets[ctx.anchorSetIndex % sets.length];
        const anchors = set.anchors;
        const cd = ctx.makeCountdown(cfg.time_limit_sec,
            { onExpire: window.submitBatteryForm, tag: 2 });

        const anchorHtml = anchors
            .map((a) => `<span style="display:inline-block;margin:0 10px;padding:6px 12px;` +
                        `background:#eef2ff;border-radius:6px;font-size:18px;` +
                        `font-weight:700">${a}</span>`)
            .join("");

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
                `<p style="text-align:center">Anchor words:</p>` +
                `<div style="text-align:center;margin:8px 0 16px">${anchorHtml}</div>` +
                `<p style="text-align:center">Enter <b>${n}</b> different nouns, each ` +
                `relatable to the anchors above.</p>`,
            html: `<div style="text-align:center">${fields}</div>`,
            button_label: "Submit",
            data: {
                test: "drat", item_id: "drat_single",
                set_id: set.set_id, anchors: anchors, battery_tag: "task",
            },
            on_load: cd.start,
            on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
        };

        return [intro, task];
    },
};
