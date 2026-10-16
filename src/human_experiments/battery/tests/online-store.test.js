const assert = require("node:assert/strict");

global.window = {};
const storage = new Map();
global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
};

const requests = [];
global.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
        ok: true,
        status: 200,
        json: async () => url.endsWith("/finish-session")
            ? { session_record_id: "session-1", complete: true }
            : { session_record_id: "session-1", status: "saved" },
    };
};

require("../js/save-client.js");

(async () => {
    const order = ["rat", "raven", "dat"];
    const store = window.createStudyStore({
        studyCode: "TEST-001",
        sessionNumber: 1,
        slot: 9,
        order,
        orderIndex: 3,
        orderSource: "lab-meeting-url",
        consent: { version: "Consent_DRAT_v3_tracked", acceptedAt: "2026-10-12T12:00:00.000Z" },
        protocolVersion: "drat-human-2026-v2",
        apiBase: "https://example.test/functions/v1",
        sessionRecordId: "session-1",
        sessionToken: "token-1",
        appVersion: "test-sha",
    });

    store.record({ test: "dat", item_id: "dat_single", response: { w0: "apple" } },
        "2026-10-12T12:01:00.000Z", "2026-10-12T12:02:00.000Z");
    await store.flush();

    assert.equal(requests[0].url, "https://example.test/functions/v1/save-block");
    assert.equal(requests[0].options.headers.Authorization, "Bearer token-1");
    assert.equal(requests[0].body.event_id, "drat-human-2026-v2:TEST-001:1:dat_single");
    assert.equal(requests[0].body.assignment.lab_meeting_order_index, 3);
    assert.equal(requests[0].body.assignment.order_source, "lab-meeting-url");
    assert.equal(requests[0].body.consent_version, "Consent_DRAT_v3_tracked");
    assert.equal(requests[0].body.app_version, "test-sha");

    const saved = await store.finish();
    assert.equal(saved.complete, true);
    assert.equal(requests.at(-1).url, "https://example.test/functions/v1/finish-session");
    console.log("Online event-store checks passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
