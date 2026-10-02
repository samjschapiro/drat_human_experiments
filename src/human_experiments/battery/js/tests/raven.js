window.STUDY_MODULES = window.STUDY_MODULES || {};
window.STUDY_MODULES.raven = function buildRaven(ctx) {
    const url = ctx.ravenUrl;
    if (url && !/^https:\/\//i.test(url)) throw new Error("Q-global URL must use HTTPS");
    const preview = !url;
    const link = preview
        ? "<p>Local preview: the licensed publisher assessment is administered separately.</p>"
        : `<p>Open the publisher assessment in a separate tab with the researcher:</p>
           <p><a href="${url}" target="_blank" rel="noopener noreferrer">Open pattern reasoning assessment</a></p>`;
    return [
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<h2>Pattern reasoning task</h2>${link}
                       <p>Return to this page after the publisher assessment is complete.</p>`,
            choices: ["Continue"],
            data: { test: "raven", item_id: "raven_handoff", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, preview } },
        },
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: "<p>Has the separate pattern reasoning assessment finished?</p>",
            choices: ["Yes, continue", "Not completed"],
            data: { test: "raven", item_id: "raven_return", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true } },
        },
    ];
};
