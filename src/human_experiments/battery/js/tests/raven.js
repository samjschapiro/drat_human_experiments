window.STUDY_MODULES = window.STUDY_MODULES || {};
window.STUDY_MODULES.raven = function buildRaven(ctx) {
    const url = ctx.ravenUrl;
    if (!/^https:\/\//i.test(url)) throw new Error("Q-global URL must use HTTPS");
    return [
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<h2>Pattern reasoning task</h2>
                       <div style="border:3px solid #b91c1c;padding:18px;margin:18px 0">
                         <strong>STOP. Wait for the researcher before opening Q-global.</strong>
                       </div>
                       <p>The researcher will give the room a current group session code and spoken instructions.</p>
                       <p>Enter Pearson-requested details only on Pearson's page. Do not enter the group code, name, date of birth, gender, or email in Thinking Tasks.</p>
                       <p><a id="raven-launch" href="${url}" target="_blank" rel="noopener noreferrer">Open Pearson Q-global in a new tab</a></p>
                       <p>Keep this tab open and return here after Raven is complete.</p>`,
            choices: ["I opened Q-global"],
            data: { test: "raven", item_id: "raven_handoff", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, launch_method: "new_tab",
                        self_registration_host: "qglobal.pearsonassessments.com", group_code_in_app: false } },
            on_load: () => {
                const button = document.querySelector("#jspsych-html-button-response-button-0 button");
                if (!button) throw new Error("Could not find the Q-global confirmation button");
                button.disabled = true;
                document.getElementById("raven-launch").addEventListener("click", () => {
                    button.disabled = false;
                });
            },
        },
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<h2>Return from Raven</h2>
                       <p>Select the button only after the Pearson assessment is fully complete.</p>
                       <p><strong>If Raven was interrupted or is not complete, stop here and raise your hand for the researcher.</strong></p>`,
            choices: ["Raven is complete — continue"],
            data: { test: "raven", item_id: "raven_return", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, completion_basis: "participant_self_report" } },
        },
    ];
};
