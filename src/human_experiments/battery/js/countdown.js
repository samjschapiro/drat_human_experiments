/*
 * Shared countdown + auto-submit helper for timed survey trials.
 *
 * jsPsych's survey-text / survey-html-form do NOT reliably auto-end on
 * `trial_duration`, so we don't depend on it: when the timer hits zero we
 * lock the trial's submit path for the full duration (the submit button is
 * hidden, per the 2026-10-13 meeting), then actively click it at zero. This
 * records whatever has been typed (empty fields → "")
 * and prevents both button and Enter-key early submission.
 *
 * Time is measured against a fixed wall-clock deadline, not by counting ticks:
 * browsers slow down timers in background tabs, and a tick counter then lets a
 * 15 s item stay up for 30-50 s. The tick only re-reads the clock, and the
 * clock is re-checked as soon as the tab becomes visible again.
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

const BATTERY_SUBMIT_SELECTOR =
    "#jspsych-survey-html-form-next, #jspsych-survey-text-next, " +
    "input[type=submit], button[type=submit]";

window.submitBatteryForm = function (options) {
    const root = document.getElementById("jspsych-content") || document;
    const form = root.querySelector("form");
    const btn = root.querySelector(BATTERY_SUBMIT_SELECTOR);
    if (options?.allowEmpty && form) {
        form.noValidate = true;
        form.dataset.allowEmpty = "true";
        form.dataset.timerLocked = "false";
    }
    if (options?.allowEmpty && btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("title");
    }
    if (btn) { btn.click(); return true; }
    return false;
};

window.requireAnyTextResponse = function requireAnyTextResponse(message) {
    const root = document.getElementById("jspsych-content") || document;
    const form = root.querySelector("form");
    if (!form) throw new Error("Could not find the active study form");
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.style.color = "#9b1c1c";
    error.style.textAlign = "center";
    form.appendChild(error);
    form.addEventListener("submit", (event) => {
        if (form.dataset.allowEmpty === "true") return;
        const inputs = [...form.querySelectorAll("input[type=text], textarea")];
        if (inputs.some((input) => input.value.trim())) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        error.textContent = message || "Enter at least one response before continuing.";
        inputs[0]?.focus();
    }, true);
};

window.makeCountdown = function (seconds, opts) {
    opts = opts || {};
    if (!seconds) {
        return { html: () => "", start: () => {}, stop: () => {}, expired: () => false };
    }

    const ID = "battery-countdown-" + Math.floor(seconds * 1000 + (opts.tag || 0));
    let intervalId = null;
    let deadline = null;
    let remaining = seconds;
    let didExpire = false;
    let activeForm = null;
    let preventEarlySubmit = null;

    function render() {
        const el = document.getElementById(ID);
        if (!el) return;
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = `Time remaining: ${m}:${String(s).padStart(2, "0")} — ` +
            "this screen submits automatically at 0:00.";
        el.style.color = remaining <= 10 ? "#b91c1c" : "#374151";
    }

    function tick() {
        if (!intervalId) return;
        remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        render();
        if (remaining <= 0) {
            didExpire = true;
            clearInterval(intervalId);
            intervalId = null;
            document.removeEventListener("visibilitychange", tick);
            if (opts.onExpire) opts.onExpire({ allowEmpty: true });
        }
    }

    return {
        html() {
            return `<div id="${ID}" style="font-weight:600;font-size:15px;` +
                   `margin-bottom:12px;text-align:center"></div>`;
        },
        start() {
            deadline = Date.now() + seconds * 1000;
            remaining = seconds;
            didExpire = false;
            const root = document.getElementById("jspsych-content") || document;
            activeForm = root.querySelector("form");
            const button = root.querySelector(BATTERY_SUBMIT_SELECTOR);
            if (!activeForm || !button) throw new Error("Timed task form is missing its submit control");
            activeForm.dataset.timerLocked = "true";
            button.disabled = true;
            button.style.display = "none";   // jsPsych CSS overrides the hidden attribute
            button.setAttribute("aria-disabled", "true");
            button.setAttribute("title", "This task submits automatically when the timer reaches zero.");
            preventEarlySubmit = (event) => {
                if (activeForm.dataset.timerLocked !== "true") return;
                event.preventDefault();
                event.stopImmediatePropagation();
            };
            activeForm.addEventListener("submit", preventEarlySubmit, true);
            render();
            intervalId = setInterval(tick, 250);
            document.addEventListener("visibilitychange", tick);
        },
        stop() {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            document.removeEventListener("visibilitychange", tick);
            if (activeForm && preventEarlySubmit) {
                activeForm.removeEventListener("submit", preventEarlySubmit, true);
            }
            activeForm = null;
            preventEarlySubmit = null;
        },
        expired() { return didExpire; },
    };
};

/*
 * Reading delay for instruction screens: the screen's buttons stay visible but
 * greyed out until `seconds` have passed, measured against a wall-clock
 * deadline like the task timers. No countdown is shown on the page (attention
 * stays on the text); hovering a button shows the time left. Call from the
 * trial's on_load. Instruction trials must also set allow_keys: false so the
 * arrow keys cannot skip ahead.
 */
window.revealButtonsAfter = function revealButtonsAfter(seconds, selector) {
    const root = document.getElementById("jspsych-content") || document;
    const buttons = [...root.querySelectorAll(selector || "button")];
    if (!buttons.length) throw new Error("Instruction screen has no button to delay");
    const deadline = Date.now() + seconds * 1000;
    const tip = document.createElement("div");
    tip.setAttribute("role", "status");
    tip.style.cssText = "position:fixed;z-index:1000;display:none;padding:4px 10px;border-radius:4px;" +
        "background:#1f2937;color:white;font-size:14px;pointer-events:none;white-space:nowrap";
    document.body.appendChild(tip);
    const wrappers = buttons.map((button) => {
        button.disabled = true;
        // Disabled buttons get no mouse events, so the wrapper catches the hover.
        button.style.pointerEvents = "none";
        const wrapper = document.createElement("span");
        wrapper.style.display = "inline-block";
        button.replaceWith(wrapper);
        wrapper.appendChild(button);
        wrapper.addEventListener("mouseenter", () => { tip.style.display = ""; update(wrapper); });
        wrapper.addEventListener("mouseleave", () => { tip.style.display = "none"; });
        return wrapper;
    });
    function label() {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        return left >= 60 ? `Available in ${Math.floor(left / 60)} min ${left % 60} s` : `Available in ${left} s`;
    }
    function update(wrapper) {
        tip.textContent = label();
        const box = wrapper.getBoundingClientRect();
        tip.style.left = `${box.left + box.width / 2 - tip.offsetWidth / 2}px`;
        tip.style.top = `${box.top - tip.offsetHeight - 8}px`;
    }
    let intervalId = null;
    function check() {
        if (tip.style.display !== "none") tip.textContent = label();
        if (Date.now() < deadline && document.body.contains(tip)) return;
        clearInterval(intervalId);
        document.removeEventListener("visibilitychange", check);
        tip.remove();
        for (const [i, button] of buttons.entries()) {
            button.disabled = false;
            button.style.pointerEvents = "";
            wrappers[i].replaceWith(button);
        }
    }
    // The tooltip leaves with the screen even if the trial ends some other way.
    const observer = new MutationObserver(() => {
        if (!buttons.some((button) => document.body.contains(button))) { tip.remove(); observer.disconnect(); }
    });
    observer.observe(root, { childList: true, subtree: true });
    intervalId = setInterval(check, 250);
    document.addEventListener("visibilitychange", check);
};

// A single-page instruction screen whose Next button becomes active after `seconds`.
window.timedInstructions = function timedInstructions(html, seconds) {
    return {
        type: jsPsychInstructions,
        pages: [html],
        show_clickable_nav: true,
        allow_keys: false,
        button_label_next: "Next",   // jsPsych appends " >"
        on_load: () => {
            const previous = document.getElementById("jspsych-instructions-back");
            if (previous) previous.style.display = "none";
            if (seconds) window.revealButtonsAfter(seconds, "#jspsych-instructions-next");
        },
    };
};
