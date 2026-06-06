/*
 * Shared countdown + auto-submit helper for timed survey trials.
 *
 * jsPsych's survey-text / survey-html-form do NOT reliably auto-end on
 * `trial_duration`, so we don't depend on it: when the timer hits zero we
 * actively click the trial's submit button, which runs the plugin's normal
 * submit path and records whatever has been typed (empty fields → "").
 *
 * The interval is always cleared in stop() (called from the trial's on_finish),
 * so a stale timer can never bleed into the next trial.
 *
 * Usage inside a timed trial:
 *   const cd = window.makeCountdown(cfg.time_limit_sec, { onExpire: window.submitBatteryForm });
 *   {
 *     ...,
 *     preamble: cd.html() + '<your preamble>',   // (survey-html-form)
 *     on_load:  cd.start,
 *     on_finish: (data) => { cd.stop(); data.timed_out = cd.expired(); }
 *   }
 *   // cfg.time_limit_sec null/0 → cd is an inert no-op (self-paced trial).
 */

window.submitBatteryForm = function () {
    const root = document.getElementById("jspsych-content") || document;
    const btn = root.querySelector(
        "#jspsych-survey-html-form-next, #jspsych-survey-text-next, " +
        "input[type=submit], button[type=submit]"
    );
    if (btn) { btn.click(); return true; }
    return false;
};

window.makeCountdown = function (seconds, opts) {
    opts = opts || {};
    if (!seconds) {
        return { html: () => "", start: () => {}, stop: () => {}, expired: () => false };
    }

    const ID = "battery-countdown-" + Math.floor(seconds * 1000 + (opts.tag || 0));
    let intervalId = null;
    let remaining = seconds;
    let didExpire = false;

    function render() {
        const el = document.getElementById(ID);
        if (!el) return;
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = `Time remaining: ${m}:${String(s).padStart(2, "0")}`;
        el.style.color = remaining <= 10 ? "#b91c1c" : "#374151";
    }

    return {
        html() {
            return `<div id="${ID}" style="font-weight:600;font-size:15px;` +
                   `margin-bottom:12px;text-align:center"></div>`;
        },
        start() {
            remaining = seconds;
            didExpire = false;
            render();
            intervalId = setInterval(() => {
                remaining -= 1;
                render();
                if (remaining <= 0) {
                    didExpire = true;
                    if (intervalId) { clearInterval(intervalId); intervalId = null; }
                    if (opts.onExpire) opts.onExpire();
                }
            }, 1000);
        },
        stop() {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
        },
        expired() { return didExpire; },
    };
};
