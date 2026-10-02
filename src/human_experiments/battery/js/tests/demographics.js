window.STUDY_MODULES = window.STUDY_MODULES || {};
window.STUDY_MODULES.demographics = function buildDemographics() {
    const option = (name, value, label, type = "radio") =>
        `<label style="display:block;margin:5px 0"><input type="${type}" name="${name}" value="${value}"> ${label}</label>`;
    const prefer = (name) => option(name, "prefer_not_to_say", "Prefer not to say");
    const field = (legend, inner) => `<fieldset style="margin:15px 0;border:1px solid #ddd"><legend>${legend}</legend>${inner}</fieldset>`;
    const text = (name) => `<input name="${name}" type="text" autocomplete="off" style="padding:7px;max-width:95%">`;
    const races = [
        "American Indian or Alaska Native", "Asian", "Black or African American",
        "Hispanic or Latino", "Middle Eastern or North African",
        "Native Hawaiian or Other Pacific Islander", "White",
    ];
    const html = [
        field("What is your age, in years?", text("age") + prefer("age_status")),
        field("What is your gender?", ["Woman", "Man"].map((x) => option("gender", x, x)).join("") +
              option("gender", "another", "Non-binary or another gender (please specify if you wish)") +
              text("gender_other") + prefer("gender")),
        field("Which of the following describe you? Select all that apply.",
              races.map((x, index) => option(`race_${index}`, x, x, "checkbox")).join("") +
              option("race_another", "another", "Another race or ethnicity (please specify if you wish)", "checkbox") +
              text("race_other") + option("race_prefer_not", "prefer_not_to_say", "Prefer not to say", "checkbox")),
        field("What is your current year of study?",
              ["First year", "Second year", "Third year", "Fourth year", "Fifth year or beyond",
               "Not currently an undergraduate"].map((x) => option("year", x, x)).join("") + prefer("year")),
        field("What is your major or main field of study?", text("major") + prefer("major_status")),
        field("Is English your first language?", option("english_first", "yes", "Yes") +
              option("english_first", "no", "No") + prefer("english_first")),
        field("If English is not your first language, at what age did you begin learning it?",
              text("english_learning_age") + prefer("english_learning_age_status")),
    ].join("");
    return [{
        type: jsPsychSurveyHtmlForm,
        preamble: "<h2>Background questions</h2><p>Every question is optional.</p>",
        html,
        button_label: "Continue",
        data: { test: "demographics", item_id: "demographics", battery_tag: "task",
                displayed_stimuli: { questionnaire_version: "Materials_DRAT_v3" } },
    }];
};
