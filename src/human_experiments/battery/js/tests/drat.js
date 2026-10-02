/* DRAT: eight assigned two-minute blocks, one for each k × relation cell. */
window.BATTERY_MODULES = window.BATTERY_MODULES || {};
window.BATTERY_MODULES.drat = {
    id: "drat",
    buildTimeline(cfg, ctx) {
        const blocks = ctx.assignmentBlocks;
        if (!Array.isArray(blocks) || blocks.length !== 8) {
            throw new Error("DRAT requires a validated eight-block participant assignment");
        }
        const n = cfg.n_words;
        if (n !== 10 || cfg.time_limit_sec !== 120) {
            throw new Error("DRAT study protocol requires ten responses and 120 seconds per block");
        }
        const intro = {
            type: jsPsychInstructions,
            pages: [cfg.intro_html],
            show_clickable_nav: true,
        };
        const trials = blocks.map((block, index) => {
            if (block.anchors.length !== block.anchor_size) throw new Error("Invalid DRAT anchor size");
            const cd = ctx.makeCountdown(120, { onExpire: window.submitBatteryForm, tag: index + 1 });
            const anchorHtml = block.anchors.map((word) =>
                `<span style="display:inline-block;margin:0 10px;padding:6px 12px;background:#eef2ff;
                    border-radius:6px;font-size:18px;font-weight:700">${word}</span>`
            ).join("");
            const fields = Array.from({ length: 10 }, (_, i) =>
                `<div style="margin:6px 0"><label style="display:inline-block;width:24px;text-align:right">${i + 1}.</label>
                 <input type="text" name="w${i}" autocomplete="off" spellcheck="false"
                        style="font-size:16px;padding:6px 8px;width:240px"></div>`
            ).join("");
            return {
                type: jsPsychSurveyHtmlForm,
                preamble: cd.html() + `<p style="text-align:center">Set ${index + 1} of 8 — anchor words:</p>
                    <div style="text-align:center;margin:8px 0 16px">${anchorHtml}</div>
                    <p style="text-align:center">Enter up to ten different nouns related to all the words above.</p>`,
                html: `<div style="text-align:center">${fields}</div>`,
                button_label: "Submit",
                data: {
                    test: "drat", item_id: block.set_id, set_id: block.set_id,
                    anchors: block.anchors, anchor_size: block.anchor_size,
                    relation: block.relation, triplet_id: block.triplet_id,
                    pair_id: block.pair_id ?? null, presentation_index: index,
                    displayed_stimuli: { anchors: block.anchors, response_limit: 10, time_limit_sec: 120 },
                    battery_tag: "task",
                },
                on_load: cd.start,
                on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); },
            };
        });
        return [intro, ...trials];
    },
};
