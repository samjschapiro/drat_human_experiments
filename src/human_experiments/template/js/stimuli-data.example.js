/*
 * Shape of the bundle that prepare_stimuli.py writes into stimuli-data.js.
 *
 * Required per-stimulus fields:
 *   - id            : string, unique within the bundle
 *   - condition     : string, hidden from participants; used for analysis
 *   - text          : string OR url, whatever the trial timeline renders
 *
 * Optional per-stimulus fields:
 *   - prompt        : context shown above the stimulus (e.g. "Rate this:")
 *   - upstream_meta : pass-through metadata that ends up in the submission JSON
 *
 * The full bundle is exposed as window.STIMULI_DATA. The frontend filters it
 * to the participant's slot via getStimuliIndicesForSlot() in experiment.js.
 */
window.STIMULI_DATA = [
    { id: "s0001", condition: "A", text: "Stimulus text #1." },
    { id: "s0002", condition: "A", text: "Stimulus text #2." },
    { id: "s0003", condition: "B", text: "Stimulus text #3." },
    { id: "s0004", condition: "B", text: "Stimulus text #4." }
    // ... typically 20 per condition for a 40-slot study
];

// Rating dimensions: extend this if your study uses more or fewer.
window.RATING_DIMENSIONS = [
    { key: "dimension_1", prompt: "How would you rate this on dimension 1?" },
    { key: "dimension_2", prompt: "How would you rate this on dimension 2?" },
    { key: "dimension_3", prompt: "How would you rate this on dimension 3?" }
];
