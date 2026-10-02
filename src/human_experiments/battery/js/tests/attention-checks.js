window.STUDY_MODULES = window.STUDY_MODULES || {};
window.STUDY_MODULES.orangeCheck = function buildOrangeCheck() {
    const prompt = "Before you begin this section, please type the word ‘orange’ in the box below.";
    return [{
        type: jsPsychSurveyText,
        preamble: `<p>${prompt}</p>`,
        questions: [{ prompt: "", name: "answer", required: false }],
        button_label: "Continue",
        data: { test: "attention", item_id: "attention_orange", battery_tag: "task",
                displayed_stimuli: { prompt } },
        on_finish: (data) => {
            const actual = String(data.response?.answer || "").trim();
            data.attention_check = { expected: "orange", actual, passed: actual.toLowerCase() === "orange" };
        },
    }];
};
