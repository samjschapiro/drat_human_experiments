/*
 * RAT — Remote Associates Test (Bowden & Jung-Beeman, 2003, CRA set).
 * Each item: 3 cue words → type the one connecting word. Per-item timer.
 * Accuracy scored offline against the answer key (kept server-side).
 */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
const RAT = {
    id: "rat",
    title: "Word Connections Task",
    eyebrow: "word connections",
    color: "#f57c00",

    intro(cfg, ctx) {
        const n = (ctx.itemBank || []).length;
        const secs = cfg.item_time_limit_sec;
        const timing = secs
            ? `you have <b>${ctx.duration(secs)}</b> for each one; when the time runs out, ` +
              `the screen moves on by itself`
            : `there is no time limit`;
        return `In this task, we will show you <b>three words</b> on each screen. One other word ` +
            `goes with all three to make a common phrase or a compound word, and we want you to ` +
            `type that word (<b>cottage</b>, <b>swiss</b>, <b>cake</b> are all connected by ` +
            `<b>cheese</b>). There are ${n} of these, and ${timing}. You get one point per ` +
            `correct answer, and a blank counts the same as a wrong one, so guess if you are ` +
            `not sure.`;
    },

    example(cfg, ctx) {
        return ctx.chips(["cottage", "swiss", "cake"], "/", ["b"]) +
            `<div class="kb-field"><label>The one word</label>` +
            `<input type="text" value="cheese" readonly></div>`;
    },

    buildTrials(cfg, ctx) {
        const bank = ctx.itemBank || [];           // window.ITEM_BANKS.rat (cues only)
        // Per-participant item order (seeded by slot so it's reproducible).
        const items = ctx.seededShuffle(bank, ctx.slot * 31 + 7);
        const start = ctx.itemStart;

        return items.map((item, idx) => {
            const cd = ctx.makeCountdown(cfg.item_time_limit_sec,
                { onExpire: window.submitBatteryForm, tag: idx + 1 });
            const c = item.cues.map((x) => `<b>${ctx.esc(x)}</b>`);
            return {
                type: jsPsychSurveyHtmlForm,
                html: () => ctx.wrap(
                    ctx.header(start + idx) + cd.html() +
                    `<div class="kb-eyebrow" style="color:${RAT.color}">${RAT.eyebrow}</div>` +
                    ctx.chips(item.cues, "/", ["b"]) +
                    `<p class="kb-ask">Type the one word that goes with ${c[0]}, ${c[1]}, and ` +
                    `${c[2]}.</p>` +
                    `<div class="kb-field"><label for="rat-answer">The one word</label>` +
                    `<input type="text" id="rat-answer" name="answer" autocomplete="off" ` +
                    `spellcheck="false" autofocus></div>` +
                    ctx.exampleBlock(RAT.example(cfg, ctx))
                ),
                button_label: "Next",
                data: { test: "rat", item_id: item.item_id, battery_tag: "task" },
                on_load: () => { cd.start(); ctx.wireCells(); },
                on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
            };
        });
    },
};
window.BATTERY_MODULES["rat"] = RAT;
