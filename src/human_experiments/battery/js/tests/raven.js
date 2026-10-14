window.STUDY_MODULES = window.STUDY_MODULES || {};
// Raven's runs on Pearson Q-global, which cannot be embedded, so it opens in a
// new tab. One button opens it and records the hand-off; the next screen holds
// the participant here until they come back from Pearson.
window.STUDY_MODULES.raven = function buildRaven(ctx) {
    const url = ctx.ravenUrl;
    if (!/^https:\/\//i.test(url)) throw new Error("Q-global URL must use HTTPS");
    return [
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<h2>Pattern reasoning task</h2>
                       <p>This task runs on Pearson's website in a new tab.</p>
                       <p><strong>Wait for the researcher's instructions before you click the button.</strong></p>
                       <p>Enter Pearson-requested details only on Pearson's page.</p>`,
            choices: ["Open the Pearson test"],
            data: { test: "raven", item_id: "raven_handoff", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, launch_method: "new_tab",
                        self_registration_host: "qglobal.pearsonassessments.com", group_code_in_app: false } },
            on_load: () => {
                const button = document.querySelector("#jspsych-html-button-response-button-0 button");
                if (!button) throw new Error("Could not find the Pearson launch button");
                // Opened inside the click itself, so the browser does not block the new tab.
                button.addEventListener("click", () => window.open(url, "_blank", "noopener,noreferrer"));
            },
        },
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<h2>Pearson test in progress</h2>
                       <div style="border:3px solid #b91c1c;padding:18px;margin:18px 0;font-size:20px">
                         <strong>Please do not move forward until you have finished the Pearson test.</strong>
                       </div>
                       <p>The test is open in another tab. Come back to this tab when Pearson says you are done.</p>
                       <p>If the test was interrupted, raise your hand for the researcher.</p>
                       <p style="font-size:14px">Closed the Pearson tab by mistake?
                         <a href="${url}" target="_blank" rel="noopener noreferrer">Open it again</a>.</p>`,
            choices: ["I have finished the Pearson test"],
            data: { test: "raven", item_id: "raven_return", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, completion_basis: "participant_self_report" } },
        },
    ];
};
