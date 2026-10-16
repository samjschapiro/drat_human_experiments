/*
 * Researcher admin panel (/admin). Sign-in is an allowlisted researcher email
 * plus the environment's admin password (POST /admin action "login"); the
 * returned 12-hour token is kept in sessionStorage and sent to /admin and
 * /get-data. Same operations as admin.sh, plus the Q-global group code.
 */
(function () {
    const ENV = (window.DEPLOY_CONFIG || {}).ENV || "";
    const API_BASE = (window.DEPLOY_CONFIG || {}).API_BASE || "";
    const EXPECTED_TASKS = { 1: 35, 2: 22 };
    const TOKEN_KEY = "drat-admin-token";
    const $ = (id) => document.getElementById(id);
    let exportData = null;

    function storedToken() {
        try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; }
    }
    function saveToken(value) {
        try {
            if (value) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value));
            else sessionStorage.removeItem(TOKEN_KEY);
        } catch { /* private window: stay signed in for this page only */ }
    }
    let auth = storedToken();
    if (auth && Date.parse(auth.expires_at) <= Date.now()) auth = null;

    async function call(path, { method = "POST", body } = {}) {
        const response = await fetch(`${API_BASE}/${path}`, {
            method,
            headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401 && auth) {
            signOut("Your sign-in expired. Sign in again.");
            throw new Error("signed out");
        }
        if (!response.ok) throw new Error(result.message || `Request failed (${response.status})`);
        return result;
    }

    function show(signedIn) {
        $("login").hidden = signedIn;
        $("panel").hidden = !signedIn;
        $("sign-out").hidden = !signedIn;
        $("who").textContent = signedIn ? `Signed in as ${auth.email}` : "";
    }

    function signOut(message) {
        auth = null;
        saveToken(null);
        exportData = null;
        $("rows").replaceChildren();
        show(false);
        $("login-error").textContent = message || "";
    }

    // ── Group code ─────────────────────────────────────────────────────────
    function renderGroupCode(result) {
        $("group-code-current").textContent = result.group_code || "(not set)";
        $("group-code-meta").textContent = result.updated_at
            ? `set by ${result.updated_by} at ${new Date(result.updated_at).toLocaleString()}` : "";
    }

    async function loadGroupCode() {
        renderGroupCode(await call("admin", { body: { action: "get_group_code" } }));
    }

    $("group-code-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        $("group-code-error").textContent = "";
        const code = $("group-code-input").value.trim();
        try {
            renderGroupCode(await call("admin", { body: { action: "set_group_code", code } }));
            $("group-code-input").value = "";
        } catch (error) {
            $("group-code-error").textContent = error.message;
        }
    });

    // ── Study links ────────────────────────────────────────────────────────
    function renderLinks() {
        const base = `${location.origin}/`;
        const items = (window.STUDY_CONFIG?.session1Orders || []).map((order, i) =>
            [`Visit 1, order ${i + 1} (${order.join(" → ")})`, `${base}?session=1&order=${i + 1}`]);
        items.push(["Visit 2 (DRAT → SCTT)", `${base}?session=2`]);
        $("study-links").replaceChildren(...items.map(([label, href]) => {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = href;
            li.append(`${label}: `, a);
            return li;
        }));
    }

    // ── Participants ───────────────────────────────────────────────────────
    function rowsFrom(data) {
        const emailOf = new Map((data.participants || []).map((p) => [p.study_code, p.email]));
        return data.sessions.map((s) => ({
            email: emailOf.get(s.study_code) || "",
            code: s.study_code,
            visit: s.session_number,
            slot: s.slot,
            // The DRAT practice is saved but optional, so it is not counted.
            tasks: `${s.events.filter((e) => e.item_id !== "drat_practice").length}/${EXPECTED_TASKS[s.session_number]}`,
            state: s.reset_at ? "reset" : (s.complete ? "complete" : "in progress"),
            last: s.completed_at || s.updated_at,
            active: !s.reset_at,
        })).sort((a, b) => (b.last || "").localeCompare(a.last || ""));
    }

    function renderTable() {
        if (!exportData) return;
        const filter = $("filter").value.trim().toLowerCase();
        const rows = rowsFrom(exportData).filter((r) =>
            !filter || r.email.includes(filter) || r.code.toLowerCase().includes(filter));
        const active = rowsFrom(exportData).filter((r) => r.active);
        $("summary").textContent =
            `${(exportData.participants || []).length} participants · ` +
            `Visit 1 complete: ${active.filter((r) => r.visit === 1 && r.state === "complete").length} · ` +
            `Visit 2 complete: ${active.filter((r) => r.visit === 2 && r.state === "complete").length} · ` +
            `in progress: ${active.filter((r) => r.state === "in progress").length} · ` +
            `loaded ${new Date(exportData.exported_at).toLocaleTimeString()}`;
        $("rows").replaceChildren(...rows.map((r) => {
            const tr = document.createElement("tr");
            const stateClass = { complete: "state-complete", "in progress": "state-progress", reset: "state-reset" }[r.state];
            for (const [value, cls] of [[r.email], [r.code], [r.visit], [r.slot], [r.tasks],
                                        [r.state, stateClass], [r.last ? new Date(r.last).toLocaleString() : ""]]) {
                const td = document.createElement("td");
                td.textContent = String(value);
                if (cls) td.className = cls;
                tr.append(td);
            }
            const td = document.createElement("td");
            if (r.active) {
                const button = document.createElement("button");
                button.className = "danger";
                button.textContent = "Reset";
                button.addEventListener("click", () => resetVisit(r));
                td.append(button);
            }
            tr.append(td);
            return tr;
        }));
    }

    async function loadParticipants() {
        $("table-error").textContent = "";
        try {
            exportData = await call("get-data", { method: "GET" });
            renderTable();
        } catch (error) {
            $("table-error").textContent = error.message;
        }
    }

    async function resetVisit(row) {
        const who = row.email || row.code;
        const reason = window.prompt(`Reset Visit ${row.visit} for ${who}?\n\nTheir saved responses are kept, ` +
            "and they can start this visit again. Enter the reason:");
        if (reason === null) return;
        if (!reason.trim()) { window.alert("A reason is required."); return; }
        try {
            await call("admin", { body: { action: "reset_session", study_code: row.code,
                                          session_number: row.visit, reason: reason.trim() } });
            await loadParticipants();
        } catch (error) {
            $("table-error").textContent = error.message;
        }
    }

    $("filter").addEventListener("input", renderTable);
    $("refresh").addEventListener("click", loadParticipants);

    // ── Downloads ──────────────────────────────────────────────────────────
    function download(name, text, type) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([text], { type }));
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // Same columns as get_data.sh.
    function csv(rows) {
        const fields = [];
        for (const row of rows) for (const k of Object.keys(row)) if (!fields.includes(k)) fields.push(k);
        const cell = (v) => {
            if (v === null || v === undefined) return "";
            const s = typeof v === "object" ? JSON.stringify(v) : String(v);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [fields.join(","), ...rows.map((r) => fields.map((f) => cell(r[f])).join(","))].join("\n") + "\n";
    }

    async function freshExport() {
        await loadParticipants();
        if (!exportData) throw new Error("export failed");
        return exportData;
    }
    const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
    function onDownload(id, build) {
        $(id).addEventListener("click", async () => {
            try { await build(await freshExport()); } catch (error) { $("table-error").textContent = error.message; }
        });
    }
    onDownload("dl-raw", (d) => download(`battery_raw_${ENV}_${stamp()}.json`, JSON.stringify(d, null, 1), "application/json"));
    onDownload("dl-participants", (d) => download(`battery_participants_${ENV}_${stamp()}.csv`, csv(d.participants || []), "text/csv"));
    onDownload("dl-sessions", (d) => download(`battery_sessions_${ENV}_${stamp()}.csv`, csv(d.sessions.map((s) => ({
        id: s.id, study_code: s.study_code, session_number: s.session_number, slot: s.slot,
        complete: s.complete, created_at: s.created_at, completed_at: s.completed_at,
        reset_at: s.reset_at, reset_reason: s.reset_reason, n_events: s.events.length,
    }))), "text/csv"));
    onDownload("dl-events", (d) => download(`battery_events_${ENV}_${stamp()}.csv`, csv(d.sessions.flatMap((s) =>
        s.events.map((e) => ({
            session_record_id: s.id, study_code: s.study_code, session_number: s.session_number, slot: s.slot,
            session_reset: Boolean(s.reset_at), received_at: e.received_at, ...e.payload,
        })))), "text/csv"));

    // ── Sign-in ────────────────────────────────────────────────────────────
    $("login-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        $("login-error").textContent = "";
        try {
            auth = await call("admin", { body: { action: "login",
                email: $("login-email").value, password: $("login-password").value } });
            saveToken(auth);
            $("login-password").value = "";
            await start();
        } catch (error) {
            auth = null;
            $("login-error").textContent = error.message;
        }
    });
    $("sign-out").addEventListener("click", () => signOut());

    async function start() {
        show(true);
        renderLinks();
        await Promise.all([loadGroupCode(), loadParticipants()]);
    }

    $("env-badge").textContent = ENV ? ENV.toUpperCase() : "LOCAL";
    $("env-badge").classList.add(ENV);
    if (!API_BASE) {
        document.querySelector("main").textContent =
            "The admin panel only works on a deployed site (no API configured here).";
        return;
    }
    if (auth) start().catch(() => {}); else show(false);
})();
