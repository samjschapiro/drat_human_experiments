window.STUDY_MODULES = window.STUDY_MODULES || {};
// Raven's runs on Pearson Q-global, which cannot be embedded, so it opens in a
// new tab. The hand-off screen shows the current Q-global group session code
// (set by researchers in /admin, re-checked every few seconds so an overwrite
// shows up) and one button that opens Pearson and records the hand-off; the
// next screen holds the participant here until they come back from Pearson.
window.STUDY_MODULES.raven = function buildRaven(ctx) {
    const url = ctx.ravenUrl;
    if (!/^https:\/\//i.test(url)) throw new Error("Q-global URL must use HTTPS");
    const POLL_MS = 5000;
    let groupCode = null;
    let pollId = null;

    const codeBox = `<div style="border:2px solid #1d4ed8;border-radius:8px;padding:14px;margin:18px auto;max-width:520px">
          <div>Q-global group session code:</div>
          <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:8px">
            <code id="raven-group-code" style="font-size:26px;font-weight:700;letter-spacing:1px;user-select:all"></code>
            <button type="button" id="raven-copy" class="jspsych-btn" style="margin:0;padding:6px 14px" hidden>Copy</button>
          </div>
          <div id="raven-code-status" style="font-size:14px;color:#555;margin-top:6px"></div>
        </div>`;

    function showCode(launchButton) {
        const codeEl = document.getElementById("raven-group-code");
        const copyEl = document.getElementById("raven-copy");
        const statusEl = document.getElementById("raven-code-status");
        if (!codeEl) return;
        codeEl.textContent = groupCode || "";
        copyEl.hidden = !groupCode;
        statusEl.textContent = groupCode ? "" : "Waiting for the researcher to set the code…";
        if (launchButton) launchButton.disabled = !groupCode;
    }

    async function refresh(launchButton) {
        try {
            groupCode = await ctx.fetchGroupCode();
            showCode(launchButton);
        } catch (error) {
            console.error("Could not load the group code:", error);
            const statusEl = document.getElementById("raven-code-status");
            if (statusEl) statusEl.textContent = "Could not load the code. Tell the researcher.";
        }
    }

    function wireCopy() {
        document.getElementById("raven-copy").addEventListener("click", async (event) => {
            await navigator.clipboard.writeText(groupCode);
            event.target.textContent = "Copied";
        });
    }

    return [
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<h2>Pattern reasoning task</h2>
                       <p>This task runs on Pearson's website in a new tab.</p>
                       <p><strong>Wait for the researcher's instructions before you click the button.</strong></p>
                       ${codeBox}
                       <p>Enter Pearson-requested details only on Pearson's page.</p>`,
            choices: ["Open the Pearson test"],
            data: { test: "raven", item_id: "raven_handoff", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, launch_method: "new_tab",
                        self_registration_host: "qglobal.pearsonassessments.com", group_code_in_app: true } },
            on_load: () => {
                const button = document.querySelector("#jspsych-html-button-response-button-0 button");
                if (!button) throw new Error("Could not find the Pearson launch button");
                // Opened inside the click itself, so the browser does not block the new tab.
                button.addEventListener("click", () => window.open(url, "_blank", "noopener,noreferrer"));
                wireCopy();
                if (!ctx.fetchGroupCode) {
                    // Local preview: there is no admin panel to set a code.
                    document.getElementById("raven-code-status").textContent =
                        "Local preview: the code is set in /admin on the deployed site.";
                    return;
                }
                button.disabled = true;
                refresh(button);
                pollId = setInterval(() => refresh(button), POLL_MS);
            },
            on_finish: (data) => {
                clearInterval(pollId);
                // Which code this participant was shown (links the Pearson record to the visit).
                data.displayed_stimuli = { ...data.displayed_stimuli, group_code: groupCode };
            },
        },
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: () => `<h2>Pearson test in progress</h2>
                       <div style="border:3px solid #b91c1c;padding:18px;margin:18px 0;font-size:20px">
                         <strong>Please do not move forward until you have finished the Pearson test.</strong>
                       </div>
                       <p>The test is open in another tab. Come back to this tab when Pearson says you are done.</p>
                       <p>If the test was interrupted, raise your hand for the researcher.</p>
                       ${groupCode ? codeBox : ""}
                       <p style="font-size:14px">Closed the Pearson tab by mistake?
                         <a href="${url}" target="_blank" rel="noopener noreferrer">Open it again</a>.</p>`,
            choices: ["I have finished the Pearson test"],
            data: { test: "raven", item_id: "raven_return", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, completion_basis: "participant_self_report" } },
            on_load: () => {
                if (!groupCode) return;
                showCode(null);
                wireCopy();
            },
        },
    ];
};
