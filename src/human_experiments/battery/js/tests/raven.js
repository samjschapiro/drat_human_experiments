window.STUDY_MODULES = window.STUDY_MODULES || {};
// Raven's runs on Pearson Q-global, which cannot be embedded, so it opens in a
// new tab. One instruction page (Babak, 2026-10-15) shows the current Q-global
// group session code (set by researchers in /admin, re-checked every few
// seconds so an overwrite shows up). Clicking the code or "here" copies it.
// It is recorded as two items: raven_handoff ends when the participant opens
// Pearson, and raven_return shows the same page, whose finish button appears
// only 10 minutes after Pearson was opened.
window.STUDY_MODULES.raven = function buildRaven(ctx) {
    const url = ctx.ravenUrl;
    if (!/^https:\/\//i.test(url)) throw new Error("Q-global URL must use HTTPS");
    const POLL_MS = 5000;
    const FINISH_DELAY_SEC = 10 * 60;
    let groupCode = null;
    let pollId = null;
    let shownAt = null;
    // When Pearson was opened, kept across a reload so the wait does not restart.
    const OPENED_KEY = `raven-opened:${ctx.participantId}`;
    const readOpened = () => { try { return Number(localStorage.getItem(OPENED_KEY)) || null; } catch { return null; } };
    const writeOpened = (ms) => { try { localStorage.setItem(OPENED_KEY, String(ms)); } catch { /* private window */ } };

    const page = (opened) => `<h2>Pattern Reasoning Task</h2>
        <ol style="text-align:left;max-width:640px;margin:0 auto;line-height:1.6">
          <li>Click <a href="#" id="raven-copy">here</a> to copy the session code.
              Session Code: <code id="raven-group-code" title="Click to copy"
                style="font-size:22px;font-weight:700;letter-spacing:1px;cursor:pointer;padding:2px 8px;
                       border:2px solid #1d4ed8;border-radius:6px"></code>
              <span id="raven-code-status" style="display:block;font-size:14px;color:#555"></span></li>
          <li>Click <a href="${url}" id="raven-open" target="_blank" rel="noopener noreferrer">here</a>
              to open the task in a new tab.${opened ? " <i>(opened)</i>" : ""}</li>
          <li>Paste the copied Session Code into the corresponding field and answer the CAPTCHA question.</li>
          <li>Enter your information and advance. When you see the symbol of an ear, <b>WAIT</b> for verbal instructions.</li>
          <li>Return to this tab once the task is finished and click the button that will appear below to advance.</li>
        </ol>
        ${opened ? `<p style="margin-top:18px"><strong>Please do not move forward until you have finished the Pearson test.</strong></p>` : ""}`;

    function showCode() {
        const codeEl = document.getElementById("raven-group-code");
        const statusEl = document.getElementById("raven-code-status");
        const openEl = document.getElementById("raven-open");
        if (!codeEl) return;
        codeEl.textContent = groupCode || "";
        codeEl.style.display = groupCode ? "" : "none";
        statusEl.textContent = groupCode ? "" : "Waiting for the researcher to set the code…";
        // Opening Pearson before a code exists would strand the participant there.
        openEl.style.pointerEvents = groupCode ? "" : "none";
        openEl.style.opacity = groupCode ? "" : "0.4";
    }

    async function refresh() {
        try {
            groupCode = await ctx.fetchGroupCode();
            showCode();
        } catch (error) {
            console.error("Could not load the group code:", error);
            const statusEl = document.getElementById("raven-code-status");
            if (statusEl) statusEl.textContent = "Could not load the code. Tell the researcher.";
        }
    }

    async function copyCode(event) {
        event.preventDefault();
        if (!groupCode) return;
        const statusEl = document.getElementById("raven-code-status");
        try {
            await navigator.clipboard.writeText(groupCode);
            statusEl.textContent = "Copied.";
        } catch {
            // Clipboard blocked: select the code so Ctrl+C / Cmd+C copies it.
            const range = document.createRange();
            range.selectNodeContents(document.getElementById("raven-group-code"));
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            statusEl.textContent = "Press Ctrl+C (Cmd+C on a Mac) to copy the selected code.";
        }
    }

    function wireCopy() {
        document.getElementById("raven-copy").addEventListener("click", copyCode);
        document.getElementById("raven-group-code").addEventListener("click", copyCode);
    }

    function startCodePolling() {
        if (!ctx.fetchGroupCode) {
            // Local preview: there is no admin panel to set a code.
            groupCode = "LOCAL-PREVIEW";
            showCode();
            return;
        }
        showCode();
        refresh();
        pollId = setInterval(refresh, POLL_MS);
    }

    return [
        {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: page(false),
            choices: "NO_KEYS",
            data: { test: "raven", item_id: "raven_handoff", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, launch_method: "new_tab",
                        self_registration_host: "qglobal.pearsonassessments.com", group_code_in_app: true } },
            on_load: () => {
                shownAt = Date.now();
                wireCopy();
                startCodePolling();
                // The link itself opens Pearson (so the browser allows the new tab);
                // the click also ends this screen.
                document.getElementById("raven-open").addEventListener("click", () => {
                    writeOpened(Date.now());
                    ctx.jsPsych.finishTrial({ response: "opened_pearson", rt: Date.now() - shownAt });
                });
            },
            on_finish: (data) => {
                clearInterval(pollId);
                // Which code this participant was shown (links the Pearson record to the visit).
                data.displayed_stimuli = { ...data.displayed_stimuli, group_code: groupCode };
            },
        },
        {
            type: jsPsychHtmlButtonResponse,
            stimulus: () => page(true),
            choices: ["I have finished the Pearson test"],
            data: { test: "raven", item_id: "raven_return", battery_tag: "task",
                    displayed_stimuli: { external_assessment: true, completion_basis: "participant_self_report",
                        finish_button_delay_sec: FINISH_DELAY_SEC } },
            on_load: () => {
                wireCopy();
                startCodePolling();
                const elapsedSec = (Date.now() - (readOpened() || Date.now())) / 1000;
                window.revealButtonsAfter(Math.max(0, FINISH_DELAY_SEC - elapsedSec),
                                          "#jspsych-html-button-response-btngroup button");
            },
            on_finish: () => clearInterval(pollId),
        },
    ];
};
