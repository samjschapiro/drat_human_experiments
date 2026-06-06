-- Generic human-experiment backend schema (Supabase / Postgres).
--
-- Two tables:
--   slots        : pre-seeded with one row per slot. UNCLAIMED rows have
--                  taken_by = NULL. The get-slot function atomically picks
--                  the lowest-numbered unclaimed row and assigns it.
--   submissions  : append-only. One row per completed session.

create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────
-- slots: one row per slot, pre-seeded
-- ────────────────────────────────────────────────────────────────────────
create table if not exists slots (
    id           integer primary key,
    taken_by     text unique,            -- participant_id; NULL = available
    taken_at     timestamptz
);

create index if not exists slots_taken_by_idx on slots (taken_by);

-- Pre-seed N slots. Adjust the series upper bound to your TOTAL_SLOTS.
insert into slots (id)
    select gs from generate_series(0, 39) gs   -- 40 slots (0..39)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- submissions: one row per completed session
-- ────────────────────────────────────────────────────────────────────────
create table if not exists submissions (
    id              uuid primary key default uuid_generate_v4(),
    participant_id  text not null,
    slot            integer references slots(id),
    payload         jsonb not null,
    submitted_at    timestamptz not null default now(),
    user_agent      text,
    source_ip       text
);

create index if not exists submissions_participant_idx on submissions (participant_id);
create index if not exists submissions_submitted_at_idx on submissions (submitted_at);

-- ────────────────────────────────────────────────────────────────────────
-- claim_slot(): atomic slot assignment. Idempotent on participant_id.
-- ────────────────────────────────────────────────────────────────────────
create or replace function claim_slot(p_participant_id text)
    returns table(slot_id integer, status text)
    language plpgsql
as $$
declare
    v_existing integer;
    v_new integer;
begin
    -- Already claimed? Return existing assignment.
    select id into v_existing from slots where taken_by = p_participant_id;
    if v_existing is not null then
        return query select v_existing, 'existing'::text;
        return;
    end if;

    -- Atomically pick the lowest-numbered unclaimed slot and claim it.
    update slots
        set taken_by = p_participant_id, taken_at = now()
        where id = (
            select id from slots
                where taken_by is null
                order by id
                limit 1
                for update skip locked
        )
        returning id into v_new;

    if v_new is null then
        return query select -1, 'full'::text;
    else
        return query select v_new, 'assigned'::text;
    end if;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- Row-level security: edge functions use the service_role key (bypasses RLS).
-- These policies block any other access path.
-- ────────────────────────────────────────────────────────────────────────
alter table slots        enable row level security;
alter table submissions  enable row level security;
-- No policies = no public access. Service role bypasses RLS.
