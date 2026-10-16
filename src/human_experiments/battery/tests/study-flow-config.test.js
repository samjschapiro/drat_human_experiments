const assert = require("node:assert/strict");

global.window = {};
require("../js/study-config.js");

const expected = [
    ["dat", "rat", "raven"],
    ["dat", "raven", "rat"],
    ["rat", "dat", "raven"],
    ["rat", "raven", "dat"],
    ["raven", "dat", "rat"],
    ["raven", "rat", "dat"],
];

assert.deepEqual(window.STUDY_CONFIG.session1Orders, expected);
for (let order = 1; order <= expected.length; order += 1) {
    assert.equal(window.resolveSession1OrderIndex(`?session=1&order=${order}`), order - 1);
}
for (const search of ["?session=1", "?order=0", "?order=7", "?order=2x"]) {
    assert.throws(() => window.resolveSession1OrderIndex(search), /requires an order parameter/);
}
assert.equal(
    window.STUDY_CONFIG.ravenUrl,
    "https://qglobal.pearsonassessments.com/qg/selfRegisterLogin.seam",
);

const storage = new Map();
global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
};
require("../js/save-client.js");
const consent = { version: "Consent_DRAT_v3_tracked", acceptedAt: "2026-10-12T12:00:00.000Z" };
const store = window.createStudyStore({
    studyCode: "TEST-001", sessionNumber: 1, slot: 4,
    order: expected[1], orderIndex: 1, orderSource: "lab-meeting-url",
    consent, protocolVersion: window.STUDY_CONFIG.protocolVersion, apiBase: "",
});
store.record({ test: "dat", item_id: "dat_single", response: { w0: "apple" } },
    "2026-10-12T12:01:00.000Z", "2026-10-12T12:02:00.000Z");
const saved = store.snapshot();
const event = saved.events["1:dat_single"].payload;
assert.equal(saved.order_index, 1);
assert.deepEqual(saved.consent, {
    version: consent.version,
    accepted_at: consent.acceptedAt,
});
assert.equal(event.event_id, "drat-human-2026-v2:TEST-001:1:dat_single");
assert.equal(event.assignment.lab_meeting_order_index, 1);
assert.equal(event.consent_version, consent.version);

let submitListener = null;
let clicked = false;
const fakeButton = {
    disabled: false,
    style: {},
    click: () => { clicked = true; },
    setAttribute: () => {},
    removeAttribute: () => {},
};
const fakeForm = {
    dataset: {},
    noValidate: false,
    addEventListener: (type, listener) => { if (type === "submit") submitListener = listener; },
    removeEventListener: (type, listener) => {
        if (type === "submit" && submitListener === listener) submitListener = null;
    },
};
const fakeRoot = {
    querySelector: (selector) => selector === "form" ? fakeForm : fakeButton,
};
global.document = {
    getElementById: (id) => id === "jspsych-content" ? fakeRoot : null,
    addEventListener: () => {},
    removeEventListener: () => {},
};
require("../js/countdown.js");
const countdown = window.makeCountdown(30, { onExpire: window.submitBatteryForm });
countdown.start();
assert.equal(fakeButton.disabled, true);
let prevented = false;
submitListener({
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => {},
});
assert.equal(prevented, true);
window.submitBatteryForm({ allowEmpty: true });
assert.equal(fakeForm.dataset.timerLocked, "false");
assert.equal(fakeForm.noValidate, true);
assert.equal(fakeButton.disabled, false);
assert.equal(clicked, true);
countdown.stop();

console.log("Study-flow configuration checks passed.");
