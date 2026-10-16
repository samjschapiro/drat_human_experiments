-- Two-session study flow: issued study codes, per-session records, and one
-- event row per recordable task (saved incrementally by the browser).
--
-- The legacy `submissions` table (one-shot Prolific flow) is left untouched so
-- no existing rows are lost; nothing new writes to it.
--
-- Privacy: the study code is the only participant identifier. No IP address,
-- user agent, name or email is stored anywhere in these tables.

-- ────────────────────────────────────────────────────────────────────────
-- Slots: one per pre-generated DRAT assignment (js/study-materials.js has 260).
-- The init migration seeded 0..159; extend to 0..259.
-- ────────────────────────────────────────────────────────────────────────
insert into slots (id)
    select gs from generate_series(160, 259) gs   -- slots 0..259; match the assignment count
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- study_codes: allowlist of issued, deidentified codes. Loaded by researchers
-- through the `admin` function (add_codes / generate_codes). A code that is
-- not here cannot start a session or claim a slot (typo guard).
-- ────────────────────────────────────────────────────────────────────────
create table if not exists study_codes (
    code        text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
    created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────
-- study_sessions: one active row per (code, session_number). A researcher
-- reset archives the row (reset_at set) instead of deleting it, so a fresh
-- attempt can start while the old attempt's events stay in the database.
-- ────────────────────────────────────────────────────────────────────────
create table if not exists study_sessions (
    id                 uuid primary key default gen_random_uuid(),
    study_code         text not null references study_codes(code),
    session_number     smallint not null check (session_number in (1, 2)),
    slot               integer not null references slots(id),
    protocol_version   text not null,
    test_order         jsonb not null,
    session_token_hash text not null,      -- sha-256 of the browser's bearer token
    complete           boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    completed_at       timestamptz,
    reset_at           timestamptz,
    reset_reason       text
);

create unique index if not exists study_sessions_active_uniq
    on study_sessions (study_code, session_number) where reset_at is null;
create index if not exists study_sessions_token_idx on study_sessions (session_token_hash);

-- ────────────────────────────────────────────────────────────────────────
-- study_events: one row per recordable task, idempotent on (session, event).
-- ────────────────────────────────────────────────────────────────────────
create table if not exists study_events (
    session_id          uuid not null references study_sessions(id),
    event_id            text not null,
    test_id             text not null,
    item_id             text not null,
    presentation_index  integer,
    payload             jsonb not null,
    received_at         timestamptz not null default now(),
    primary key (session_id, event_id),
    unique (session_id, item_id)
);

-- ────────────────────────────────────────────────────────────────────────
-- start_session(): validate code, enforce Session 1 → Session 2, claim or
-- reuse the slot, and (re)issue the session token. Re-entering a code resumes
-- the same session record with a new token (the study code alone is the
-- credential, by study-team decision).
--
-- status: 'started' | 'resumed' | 'complete' | 'unknown_code'
--         | 'session1_incomplete' | 'slots_full'
-- ────────────────────────────────────────────────────────────────────────
create or replace function start_session(
    p_code            text,
    p_session_number  smallint,
    p_token_hash      text,
    p_protocol        text,
    p_session1_orders jsonb,
    p_session2_order  jsonb
)
    returns table(session_id uuid, slot integer, test_order jsonb, complete boolean, status text)
    language plpgsql
as $$
declare
    v_existing study_sessions%rowtype;
    v_s1       study_sessions%rowtype;
    v_slot     integer;
    v_order    jsonb;
begin
    if not exists (select 1 from study_codes where code = p_code) then
        return query select null::uuid, null::integer, null::jsonb, false, 'unknown_code'::text;
        return;
    end if;

    -- Existing active session for this code + session number: resume it.
    select * into v_existing from study_sessions s
        where s.study_code = p_code and s.session_number = p_session_number and s.reset_at is null
        for update;
    if found then
        if v_existing.complete then
            return query select v_existing.id, v_existing.slot, v_existing.test_order, true, 'complete'::text;
            return;
        end if;
        update study_sessions set session_token_hash = p_token_hash, updated_at = now()
            where id = v_existing.id;
        return query select v_existing.id, v_existing.slot, v_existing.test_order, false, 'resumed'::text;
        return;
    end if;

    if p_session_number = 1 then
        select c.slot_id into v_slot from claim_slot(p_code) c;
        if v_slot is null or v_slot = -1 then
            return query select null::uuid, null::integer, null::jsonb, false, 'slots_full'::text;
            return;
        end if;
        v_order := p_session1_orders -> (v_slot % jsonb_array_length(p_session1_orders));
    else
        select * into v_s1 from study_sessions s
            where s.study_code = p_code and s.session_number = 1 and s.reset_at is null;
        if not found or not v_s1.complete then
            return query select null::uuid, null::integer, null::jsonb, false, 'session1_incomplete'::text;
            return;
        end if;
        v_slot  := v_s1.slot;
        v_order := p_session2_order;
    end if;

    insert into study_sessions (study_code, session_number, slot, protocol_version,
                                test_order, session_token_hash)
        values (p_code, p_session_number, v_slot, p_protocol, v_order, p_token_hash)
        returning * into v_existing;
    return query select v_existing.id, v_existing.slot, v_existing.test_order, false, 'started'::text;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- save_event(): idempotent insert. An identical replay is 'duplicate'; a
-- different payload under an existing event_id is 'conflict' and is NOT
-- written (stored data is never overwritten).
-- ────────────────────────────────────────────────────────────────────────
create or replace function save_event(
    p_session_id         uuid,
    p_event_id           text,
    p_test_id            text,
    p_item_id            text,
    p_presentation_index integer,
    p_payload            jsonb
)
    returns text
    language plpgsql
as $$
declare
    v_existing jsonb;
begin
    insert into study_events (session_id, event_id, test_id, item_id, presentation_index, payload)
        values (p_session_id, p_event_id, p_test_id, p_item_id, p_presentation_index, p_payload)
        on conflict do nothing;
    if found then
        update study_sessions set updated_at = now() where id = p_session_id;
        return 'saved';
    end if;
    select payload into v_existing from study_events
        where session_id = p_session_id and (event_id = p_event_id or item_id = p_item_id)
        limit 1;
    if v_existing = p_payload then
        return 'duplicate';
    end if;
    return 'conflict';
end;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- Access: RLS on with no policies (no public table access); functions only
-- callable by the service role used inside the Edge Functions.
-- ────────────────────────────────────────────────────────────────────────
alter table study_codes    enable row level security;
alter table study_sessions enable row level security;
alter table study_events   enable row level security;

revoke execute on function start_session(text, smallint, text, text, jsonb, jsonb)
    from public, anon, authenticated;
grant  execute on function start_session(text, smallint, text, text, jsonb, jsonb) to service_role;
revoke execute on function save_event(uuid, text, text, text, integer, jsonb)
    from public, anon, authenticated;
grant  execute on function save_event(uuid, text, text, text, integer, jsonb) to service_role;
