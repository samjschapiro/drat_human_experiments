window.STUDY_MODULES = window.STUDY_MODULES || {};
window.STUDY_MODULES.bfi10 = function buildBfi10() {
    const items = [
        "is reserved", "is generally trusting", "tends to be lazy",
        "is relaxed, handles stress well", "has few artistic interests",
        "is outgoing, sociable", "tends to find fault with others",
        "does a thorough job", "gets nervous easily", "has an active imagination",
    ];
    const choices = ["Disagree strongly", "Disagree a little", "Neither agree nor disagree",
                     "Agree a little", "Agree strongly"];
    const row = (id, text) => `<fieldset style="margin:14px 0;border:1px solid #ddd">
        <legend>${text}</legend>${choices.map((label, index) =>
            `<label style="display:inline-block;margin:5px 9px"><input type="radio" name="${id}" value="${index + 1}"> ${label}</label>`
        ).join("")}</fieldset>`;
    const rows = items.map((text, index) => {
        const question = row(`bfi_${index + 1}`, `${index + 1}. I see myself as someone who ${text}.`);
        return index === 4
            ? question + row("attention_1", "Please select ‘Disagree strongly’ for this item.")
            : question;
    }).join("");
    return [{
        type: jsPsychSurveyHtmlForm,
        preamble: "<h2>About you</h2><p>For each statement, choose the answer that best describes you.</p>",
        html: rows,
        button_label: "Continue",
        data: { test: "bfi10", item_id: "bfi10", battery_tag: "task",
                displayed_stimuli: { items, attention_prompt: "Please select ‘Disagree strongly’ for this item." } },
        on_finish: (data) => {
            data.attention_check = {
                expected: "1", actual: data.response?.attention_1 ?? null,
                passed: data.response?.attention_1 === "1",
            };
        },
    }];
};
