/*
 * DRAT: a one-minute practice set, a check-in screen, then eight assigned
 * two-minute blocks, one for each k × relation cell.
 */
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
        const practice = cfg.practice;
        if (!practice || !Array.isArray(practice.anchors) || !practice.time_limit_sec || !cfg.post_practice_html) {
            throw new Error("DRAT requires a practice set and a post-practice screen");
        }

        function setTrial({ anchors, seconds, heading, tag, data }) {
            const cd = ctx.makeCountdown(seconds, { onExpire: window.submitBatteryForm, tag });
            const anchorHtml = anchors.map((word) =>
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
                preamble: cd.html() + `<p style="text-align:center">${heading}</p>
                    <div style="text-align:center;margin:8px 0 16px">${anchorHtml}</div>
                    <p style="text-align:center">Enter 10 nouns that are as different from each other as possible, while each noun still relates to all of the anchor words.</p>`,
                html: `<div style="text-align:center">${fields}</div>`,
                button_label: "Submit",
                data: { ...data, displayed_stimuli: { anchors, response_limit: 10, time_limit_sec: seconds,
                    submission_locked_until_timeout: true }, battery_tag: "task" },
                on_load: () => {
                    cd.start();
                    window.requireAnyTextResponse("Enter at least one noun before submitting.");
                },
                on_finish: (result) => { cd.stop(); result.timed_out = cd.expired(); },
            };
        }

        const intro = window.timedInstructions(cfg.intro_html, cfg.intro_delay_sec);
        // Saved (item drat_practice) but not required to finish the visit.
        const practiceTrial = setTrial({
            anchors: practice.anchors, seconds: practice.time_limit_sec,
            heading: "Practice set — anchor words:", tag: 99,
            data: { test: "drat_practice", item_id: "drat_practice", anchors: practice.anchors,
                    anchor_size: practice.anchors.length },
        });
        const afterPractice = window.timedInstructions(cfg.post_practice_html, 0);
        const trials = blocks.map((block, index) => {
            if (block.anchors.length !== block.anchor_size) throw new Error("Invalid DRAT anchor size");
            return setTrial({
                anchors: block.anchors, seconds: 120, heading: `Set ${index + 1} of 8 — anchor words:`,
                tag: index + 1,
                data: {
                    test: "drat", item_id: block.set_id, set_id: block.set_id,
                    anchors: block.anchors, anchor_size: block.anchor_size,
                    relation: block.relation, triplet_id: block.triplet_id,
                    pair_id: block.pair_id ?? null, presentation_index: index,
                },
            });
        });
        return [intro, practiceTrial, afterPractice, ...trials];
    },
};
