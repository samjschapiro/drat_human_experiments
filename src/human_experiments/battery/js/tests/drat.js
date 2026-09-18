/*
 * DRAT — Divergent Remote Association Task (Schapiro, Gladstone, Black & Ji, 2026).
 * Participant types n_words nouns that are (a) maximally different from each other
 * AND (b) each relatable to the k anchor words shown. The anchor set is chosen by
 * the participant's slot (ctx.anchorSetIndex). Scored offline (utility threshold +
 * DAT-style pairwise distance over surviving words).
 *
 * Participants are asked to connect each word to ALL anchors, with a clear
 * connection to just one accepted as a fallback (the scorer's utility is the
 * similarity to the closest anchor, so this matches how words are kept).
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
const DRAT = {
    id: "drat",
    title: "Connected but Different Task",
    eyebrow: "connected but different",
    color: "#7b1fa2",
    rules: "Use single words, and only nouns \u2014 no names of people, places or brands, " +
           "and no technical terms.",

    // "both of them" / "all 3 of them"
    allOf(k) { return k === 2 ? "both of them" : `all ${k} of them`; },
    // "<b>fire</b> and <b>ice</b>" / "<b>a</b>, <b>b</b>, and <b>c</b>"
    list(words, ctx) {
        const b = words.map((w) => `<b>${ctx.esc(w)}</b>`);
        return b.length === 2 ? `${b[0]} and ${b[1]}`
                              : `${b.slice(0, -1).join(", ")}, and ${b[b.length - 1]}`;
    },

    intro(cfg, ctx) {
        const n = cfg.n_words || 10;
        const bank = ctx.itemBank || {};
        const k = bank.k_anchors || (bank.anchor_sets && bank.anchor_sets[0]
            ? bank.anchor_sets[0].anchors.length : 2);
        return `In this task, we will show you <b>${k} words</b>, and ask you to type ` +
            `<b>${n} words</b> that each <b>connect to ${DRAT.allOf(k)}</b> and are ` +
            `<b>as different from each other as possible</b>. A connection can be loose or ` +
            `figurative (<b>flow</b> connects to <b>river</b>, because a river flows, and to ` +
            `<b>clock</b>, because time flows). If you really cannot connect a word to ` +
            `${DRAT.allOf(k)}, one is acceptable; a word connected to none will not count. ` +
            `${DRAT.rules} Words that are not connected enough are set aside, and the rest are ` +
            `scored on how different they are from each other, so you need at least 3 connected ` +
            `words to get a score. ${ctx.timing(cfg.time_limit_sec)}`;
    },

    example(cfg, ctx) {
        return ctx.chips(["river", "clock"], "&amp;") +
            ctx.wordGrid(4, ["flow", "cycle", "rhythm", "drift"], true);
    },

    buildTrials(cfg, ctx) {
        const n = cfg.n_words || 10;
        const drat = ctx.itemBank || { anchor_sets: [] };
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
        const start = ctx.itemStart;
        const cd = ctx.makeCountdown(cfg.time_limit_sec,
            { onExpire: window.submitBatteryForm, tag: 2 });

        const task = {
            type: jsPsychSurveyHtmlForm,
            html: () => ctx.wrap(
                ctx.header(start) + cd.html() +
                `<div class="kb-eyebrow" style="color:${DRAT.color}">${DRAT.eyebrow}</div>` +
                ctx.chips(anchors, "&amp;") +
                `<p class="kb-ask">Type <b>${n} words</b> that each connect to ` +
                `${DRAT.list(anchors, ctx)} (or to at least one) and are as different from ` +
                `each other as possible, one per box.</p>` +
                ctx.wordGrid(n) +
                ctx.exampleBlock(DRAT.example(cfg, ctx))
            ),
            button_label: "Submit",
            data: {
                test: "drat", item_id: "drat_single",
                set_id: set.set_id, anchors: anchors, battery_tag: "task",
            },
            on_load: () => { cd.start(); ctx.wireCells(); },
            on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
        };

        return [task];
    },
};
window.BATTERY_MODULES["drat"] = DRAT;
