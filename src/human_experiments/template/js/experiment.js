/*
 * Generic rating-task frontend.
 *
 * Reads window.STIMULI_DATA (a flat array) and window.RATING_DIMENSIONS
 * from stimuli-data.js, asks the backend for a slot, filters the bundle to
 * that slot's items, and runs one slider trial per (stimulus × dimension).
 *
 * Backend endpoints — set at deploy time by deploy.sh, or hand-edit:
 *   GET  ${API}/getSlot?PROLIFIC_PID=...   → { slot, total_slots, status }
 *   POST ${API}/submitData                  → { status, filename }
 */

// =============== CONFIG (replaced at deploy time) ===============
const API_BASE = '__API_BASE__';                 // deploy.sh sed-substitutes this
const COMPLETION_URL = '__COMPLETION_URL__';     // crowd platform completion redirect
const TOTAL_SLOTS = 40;                          // must match backend's TOTAL_SLOTS
const STIMULI_PER_SLOT = 10;                     // items each participant sees
// =================================================================

let participantId = '';
let participantSlot = -1;
let isDebugMode = false;
let jsPsych = null;

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

/**
 * Deterministic mapping of slot index → which stimulus indices to show.
 * Replace with your own balancing logic if you need a different design.
 *
 * Default: 4-wave Latin square. With STIMULI_PER_SLOT=10 and 40 total stimuli,
 * slots 0..3 see items [0..9], [10..19], [20..29], [30..39]. Each stimulus
 * gets exactly (TOTAL_SLOTS / 4) = 10 ratings.
 */
function getStimuliIndicesForSlot(slot, totalStimuli, perParticipant) {
    const waveSize = totalStimuli / perParticipant;
    const positionInWave = slot % waveSize;
    const startIdx = positionInWave * perParticipant;
    const indices = [];
    for (let i = 0; i < perParticipant; i++) indices.push(startIdx + i);
    return indices;
}

function seededShuffle(array, seed) {
    function mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const rng = mulberry32(seed);
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

async function fetchSlot(pid) {
    const res = await fetch(`${API_BASE}/getSlot?PROLIFIC_PID=${encodeURIComponent(pid)}`);
    if (!res.ok) throw new Error(`getSlot returned ${res.status}`);
    return res.json();
}

async function submitData(payload) {
    const res = await fetch(`${API_BASE}/submitData`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`submitData returned ${res.status}`);
    return res.json();
}

function buildTimeline(stimuli, ratingDims, seed) {
    // One slider trial per (stimulus × dimension). Shuffle the per-stimulus
    // dimension blocks per participant to control order effects.
    const trials = [];
    for (const stim of stimuli) {
        const dims = seededShuffle(ratingDims, seed + stim.id.charCodeAt(0));
        for (const dim of dims) {
            trials.push({
                type: jsPsychHtmlSliderResponse,
                stimulus: `
                    <div style="margin-bottom: 20px; font-size: 18px; font-style: italic;">
                        ${stim.prompt || ''}
                    </div>
                    <div style="margin: 24px 0; padding: 16px; border: 1px solid #ddd; border-radius: 6px;">
                        ${stim.text}
                    </div>
                `,
                labels: ['Not at all', 'Extremely'],
                min: 0, max: 100, slider_start: 50,
                require_movement: true,
                prompt: `<p style="font-size: 16px;">${dim.prompt}</p>`,
                data: {
                    stimulus_id: stim.id,
                    condition: stim.condition,
                    rating_dimension: dim.key,
                    trial_type_tag: 'rating'
                },
                on_finish: (data) => { data.rating_value = data.response; }
            });
        }
    }
    return trials;
}

async function main() {
    // Resolve participant ID
    const prolificPid = getQueryParam('PROLIFIC_PID');
    if (!prolificPid) {
        isDebugMode = true;
        participantId = `debug_${Date.now()}`;
        document.getElementById('debug-banner').style.display = 'block';
    } else {
        participantId = prolificPid;
    }

    // Slot assignment
    if (isDebugMode) {
        participantSlot = 0; // deterministic in debug
    } else {
        const slotResponse = await fetchSlot(participantId);
        participantSlot = slotResponse.slot;
    }

    // Filter the bundle to this slot's items
    const allStimuli = window.STIMULI_DATA || [];
    if (allStimuli.length === 0) {
        document.body.innerHTML = '<p style="padding: 40px; text-align: center;">Error: no stimuli loaded.</p>';
        return;
    }
    const indices = getStimuliIndicesForSlot(participantSlot, allStimuli.length, STIMULI_PER_SLOT);
    const participantStimuli = seededShuffle(
        indices.map(i => allStimuli[i]).filter(Boolean),
        participantSlot * 7919
    );

    const ratingDims = window.RATING_DIMENSIONS || [];
    if (ratingDims.length === 0) {
        document.body.innerHTML = '<p style="padding: 40px; text-align: center;">Error: no rating dimensions defined.</p>';
        return;
    }

    // Build timeline
    const consent = {
        type: jsPsychInstructions,
        pages: [
            `<h2>Consent</h2>
             <p>You will rate ${participantStimuli.length} items on ${ratingDims.length} dimensions each.
             This should take about 10 minutes.</p>
             <p>Your responses are anonymous beyond your crowd-platform ID.
             Click Next to continue.</p>`
        ],
        show_clickable_nav: true
    };

    const ratingTrials = buildTimeline(participantStimuli, ratingDims, participantSlot);

    const debrief = {
        type: jsPsychHtmlButtonResponse,
        stimulus: isDebugMode
            ? '<h2>Debug complete</h2><p>Data NOT submitted. Check console for payload.</p>'
            : '<h2>Thank you!</h2><p>Submitting…</p>',
        choices: ['Finish'],
        on_finish: async () => {
            const payload = {
                participant_id: participantId,
                slot: participantSlot,
                ratings: jsPsych.data.get().filter({ trial_type_tag: 'rating' }).values(),
                client_metadata: {
                    user_agent: navigator.userAgent,
                    submitted_at: new Date().toISOString(),
                    debug_mode: isDebugMode
                }
            };

            if (isDebugMode) {
                console.log('DEBUG payload', payload);
                return;
            }

            try {
                await submitData(payload);
                window.location.href = COMPLETION_URL;
            } catch (err) {
                console.error('submitData failed', err);
                document.body.innerHTML = `<p style="padding:40px">
                    Submission failed. Please email the researchers with this code:
                    <code>${participantId}</code>.
                </p>`;
            }
        }
    };

    jsPsych = initJsPsych();
    jsPsych.run([consent, ...ratingTrials, debrief]);
}

main().catch(err => {
    console.error('Experiment failed to start', err);
    document.body.innerHTML = `<p style="padding:40px">
        Experiment failed to start. Please try again. (${err.message})
    </p>`;
});
