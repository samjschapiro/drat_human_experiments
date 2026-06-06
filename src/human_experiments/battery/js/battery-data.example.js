/*
 * Shape of the bundle that prepare_battery.py writes into battery-data.js.
 *
 * Two globals, loaded by index.html before the test modules and core.js:
 *
 *   window.BATTERY_CONFIG — counterbalance orders + per-test runtime params.
 *   window.ITEM_BANKS     — the client-facing items for each test.
 *
 * ANSWER KEYS ARE NEVER IN HERE. RAT solutions live only in item_banks/ and are
 * read by the offline scorer; the client bundle ships cues only.
 *
 * core.js maps the server-assigned integer `slot` to:
 *   orderIndex     = slot % BATTERY_CONFIG.orders.length
 *   order          = BATTERY_CONFIG.orders[orderIndex]
 *   anchorSetIndex = Math.floor(slot / orders.length) % BATTERY_CONFIG.n_anchor_sets
 */
window.BATTERY_CONFIG = {
    battery_version: "1.0.0",
    total_slots: 160,                 // == backend TOTAL_SLOTS (schema + env)
    n_anchor_sets: 8,                 // length of ITEM_BANKS.drat.anchor_sets
    orders: [                         // index = orderIndex; each is a permutation
        ["dat", "drat", "rat", "sctt"],
        ["rat", "dat", "sctt", "drat"]
        // ...
    ],
    tests: {                          // per-test runtime params (no item-bank paths)
        dat:  { n_words: 10, time_limit_sec: 240, intro_html: "..." },
        rat:  { item_time_limit_sec: 15, n_items: 30, item_select: "easiest",
                intro_html: "..." },
        sctt: { n_responses_per_item: 3, time_limit_sec: null, intro_html: "..." },
        drat: { n_words: 10, k_anchors: 4, time_limit_sec: 240, intro_html: "..." }
    }
};

window.ITEM_BANKS = {
    // RAT: cues only — solution stripped.
    rat: [
        { item_id: "rat_001", cues: ["cottage", "swiss", "cake"] }
        // ...
    ],
    // SCTT: scenario prompts, each tagged with its scorer `task` type.
    sctt: [
        { item_id: "sctt_rq_1", task: "research question",
          prompt: "a planet outside our galaxy",
          prompt_html: "You travel ... <b>What scientific questions could you ask?</b>" }
        // ...
    ],
    // DRAT: anchor sets; the participant gets one (indexed by anchorSetIndex).
    drat: {
        k_anchors: 4,
        anchor_sets: [
            { set_id: "drat_as_0", anchors: ["fire", "ice", "wind", "stone"] }
            // ...
        ]
    },
    // DAT has no item bank.
    dat: null
};
