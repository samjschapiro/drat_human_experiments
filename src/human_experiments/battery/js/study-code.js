window.requestStudyConsent = function requestStudyConsent(study) {
    return new Promise((resolve) => {
        document.body.innerHTML = `
            <main style="max-width:850px;margin:4vh auto;padding:24px;background:white;border-radius:8px">
              <h1>Consent to participate</h1>
              <p>Please read the complete approved consent document before deciding.</p>
              <object data="${study.consentPdfUrl}" type="application/pdf"
                      style="width:100%;height:60vh;border:1px solid #bbb">
                <p>This browser cannot display the PDF inline.
                  <a href="${study.consentPdfUrl}" target="_blank" rel="noopener">Open the consent PDF</a>.
                </p>
              </object>
              <p><a href="${study.consentPdfUrl}" target="_blank" rel="noopener">Open the consent PDF in a new tab</a></p>
              <p>By choosing <strong>I agree</strong>, you confirm that you have read the document and agree to participate.</p>
              <button id="consent-agree" class="jspsych-btn">I agree</button>
              <button id="consent-decline" class="jspsych-btn" style="background:#555">I do not agree</button>
            </main>`;
        document.getElementById("consent-agree").addEventListener("click", () => resolve({
            version: study.consentVersion,
            acceptedAt: new Date().toISOString(),
        }));
        document.getElementById("consent-decline").addEventListener("click", () => {
            document.body.innerHTML = `<main style="max-width:580px;margin:8vh auto;padding:24px;background:white;border-radius:8px">
                <h1>Study stopped</h1>
                <p>You have not agreed to participate. No study session was created.</p>
                <p>Please notify the researcher.</p>
            </main>`;
            resolve(null);
        });
    });
};

window.requestStudyEntry = function requestStudyEntry(options) {
    const fixedSession = options?.sessionNumber ?? null;
    return new Promise((resolve) => {
        document.body.innerHTML = `
            <main style="max-width:580px;margin:8vh auto;padding:24px;background:white;border-radius:8px">
              <h1>Thinking Tasks</h1>
              <p>Enter the deidentified study code provided by the researcher.</p>
              <form id="study-entry">
                <label for="study-code">Study code</label><br>
                <input id="study-code" name="study-code" required autocomplete="off"
                       placeholder="DRAT-001" maxlength="32" style="font-size:18px;padding:8px;width:95%"><br><br>
                <div id="session-picker" ${fixedSession ? "hidden" : ""}>
                <label for="study-session">Session</label><br>
                <select id="study-session" style="font-size:18px;padding:8px;width:100%">
                  <option value="1">Session 1</option>
                  <option value="2">Session 2</option>
                </select><br><br></div>
                <p id="study-entry-error" role="alert" style="color:#9b1c1c"></p>
                <button type="submit" class="jspsych-btn">Start session</button>
              </form>
            </main>`;
        if (fixedSession) document.getElementById("study-session").value = String(fixedSession);
        document.getElementById("study-entry").addEventListener("submit", (event) => {
            event.preventDefault();
            const code = document.getElementById("study-code").value.trim().toUpperCase();
            if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) {
                document.getElementById("study-entry-error").textContent =
                    "Use 3–32 letters, numbers, or hyphens; do not enter a name or email.";
                return;
            }
            resolve({ studyCode: code, sessionNumber: Number(document.getElementById("study-session").value) });
        });
    });
};
