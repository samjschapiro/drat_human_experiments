window.STUDY_MODULES = window.STUDY_MODULES || {};
// Demographics (Babak's question set, 2026-10-15). Every shown question is
// required; "Year" appears only for "Some college" and "Native language" only
// for non-native English speakers. Hidden questions are disabled, so they are
// neither required nor saved. Choosing "Other" makes its text box required.
// The final comment box is optional.
window.STUDY_MODULES.demographics = function buildDemographics() {
    const option = (name, value, type = "radio") =>
        `<label style="display:block;margin:5px 0"><input type="${type}" name="${name}" value="${value}"> ${value}</label>`;
    const other = (name, type = "radio") =>
        `<label style="display:block;margin:5px 0"><input type="${type}" name="${name}" value="Other"> Other:
         <input type="text" name="${name}_other" autocomplete="off" style="padding:5px;width:260px" disabled></label>`;
    const field = (id, legend, inner) =>
        `<fieldset id="demo-${id}" style="margin:15px 0;border:1px solid #ddd"><legend>${legend}</legend>${inner}</fieldset>`;
    const radios = (name, values) => values.map((v) => option(name, v)).join("");

    const ethnicities = ["Non-hispanic White", "Hispanic", "Black or African American",
        "American Indian or Alaska Native", "Asian", "Native Hawaiian or Pacific Islander"];
    const html = [
        field("education", "What is your highest completed level of education?", radios("education", [
            "Less than high school", "High school graduate", "Some college", "2 year degree",
            "4 year degree", "Professional degree", "Doctorate"])),
        field("college_year", "Please select your highest year in college:",
              radios("college_year", ["Freshman", "Sophomore", "Junior", "Senior"]) + other("college_year")),
        field("gender", "Which gender do you best identify yourself with?",
              radios("gender", ["Male", "Female", "Non-binary / third gender", "Prefer not to say"]) + other("gender")),
        field("ethnicity", "Select the race/ethnicity or race/ethnicities that best describe you.",
              ethnicities.map((v, i) => option(`ethnicity_${i + 1}`, v, "checkbox")).join("") +
              other("ethnicity_7", "checkbox") +
              `<p id="demo-ethnicity-error" role="alert" style="color:#9b1c1c;margin:4px 0"></p>`),
        field("income", "What was your total household income before taxes during the past 12 months?",
              radios("income", ["Less than $10,000", "$10,000 - $19,999", "$20,000 - $29,999",
                  "$30,000 - $39,999", "$40,000 - $49,999", "$50,000 - $59,999", "$60,000 - $69,999",
                  "$70,000 - $79,999", "$80,000 - $89,999", "$90,000 - $99,999", "$100,000 - $149,999",
                  "More than $150,000", "Prefer not to say"])),
        field("english", "Is English your first/native language?", radios("english_native", ["No", "Yes"])),
        field("native_language", "Please name your native language(s).",
              `<input type="text" name="native_language" autocomplete="off" style="padding:7px;width:90%">`),
        field("comment", "Do you have any final comments or questions about this experiment (setup, " +
              "instructions, steps, results, assessment, etc.)? If any questions or chat contents made you " +
              "uncomfortable, you may also use this space to report it to the research team, who will follow " +
              "up with you via email. If not, please click on the button below to continue. (Optional)",
              `<textarea name="comment" rows="5" style="width:95%;font-size:15px;padding:6px"></textarea>`),
    ].join("");

    function wire() {
        const form = document.querySelector("#jspsych-content form");
        if (!form) throw new Error("Could not find the demographics form");
        const inputs = (name) => [...form.querySelectorAll(`[name="${name}"]`)];
        const checked = (name, value) => inputs(name).some((i) => i.checked && (!value || i.value === value));
        const setShown = (id, shown) => {
            const box = document.getElementById(`demo-${id}`);
            box.style.display = shown ? "" : "none";
            for (const input of box.querySelectorAll("input, textarea")) input.disabled = !shown;
        };
        // Required radio groups: one `required` input per group is enough for the browser.
        for (const name of ["education", "college_year", "gender", "income", "english_native"]) {
            inputs(name)[0].required = true;
        }
        inputs("native_language")[0].required = true;

        function update() {
            setShown("college_year", checked("education", "Some college"));
            setShown("native_language", checked("english_native", "No"));
            // "Other" text boxes are enabled and required only while "Other" is chosen.
            for (const name of ["college_year", "gender", "ethnicity_7"]) {
                const box = inputs(`${name}_other`)[0];
                const on = checked(name, "Other") && !inputs(name)[0].disabled;
                box.disabled = !on;
                box.required = on;
            }
        }
        form.addEventListener("change", update);
        update();

        // At least one race/ethnicity box (the browser cannot require a checkbox group).
        form.addEventListener("submit", (event) => {
            const any = [...form.querySelectorAll('#demo-ethnicity input[type="checkbox"]')].some((i) => i.checked);
            const error = document.getElementById("demo-ethnicity-error");
            error.textContent = any ? "" : "Please select at least one option.";
            if (!any) {
                event.preventDefault();
                event.stopImmediatePropagation();
                document.getElementById("demo-ethnicity").scrollIntoView({ block: "center" });
            }
        }, true);
    }

    return [{
        type: jsPsychSurveyHtmlForm,
        preamble: "<h2>Background questions</h2><p>Please answer every question. The final comment box is optional.</p>",
        html,
        button_label: "Continue",
        data: { test: "demographics", item_id: "demographics", battery_tag: "task",
                displayed_stimuli: { questionnaire_version: "Demographics_Babak_2026-10-15" } },
        on_load: wire,
    }];
};
