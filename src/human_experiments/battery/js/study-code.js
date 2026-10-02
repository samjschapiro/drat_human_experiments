window.requestStudyEntry = function requestStudyEntry() {
    const suggestedSession = new URLSearchParams(location.search).get("session");
    return new Promise((resolve) => {
        document.body.innerHTML = `
            <main style="max-width:580px;margin:8vh auto;padding:24px;background:white;border-radius:8px">
              <h1>Thinking Tasks — local study preview</h1>
              <p>Enter a deidentified study code and choose the session to preview.</p>
              <form id="study-entry">
                <label for="study-code">Study code</label><br>
                <input id="study-code" name="study-code" required autocomplete="off"
                       placeholder="DRAT-001" maxlength="32" style="font-size:18px;padding:8px;width:95%"><br><br>
                <label for="study-session">Session</label><br>
                <select id="study-session" style="font-size:18px;padding:8px;width:100%">
                  <option value="1">Session 1</option>
                  <option value="2">Session 2</option>
                </select><br><br>
                <p id="study-entry-error" role="alert" style="color:#9b1c1c"></p>
                <button type="submit" class="jspsych-btn">Start local preview</button>
              </form>
            </main>`;
        if (suggestedSession === "2") document.getElementById("study-session").value = "2";
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
