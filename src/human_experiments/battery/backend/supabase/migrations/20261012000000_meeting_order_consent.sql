-- Persist the approved lab-meeting order and consent audit fields. Session 1
-- order is selected by the operator URL, not derived from the DRAT slot.

alter table study_sessions
    add column if not exists lab_meeting_order_index smallint
        check (lab_meeting_order_index between 0 and 5),
    add column if not exists order_source text
        check (order_source in ('lab-meeting-url', 'session-2-fixed')),
    add column if not exists consent_version text,
    add column if not exists consent_accepted_at timestamptz;

drop function if exists start_session(text, smallint, text, text, jsonb, jsonb);

create or replace function start_session(
    p_code                text,
    p_session_number      smallint,
    p_token_hash          text,
    p_protocol            text,
    p_session1_order      jsonb,
    p_order_index         smallint,
    p_consent_version     text,
    p_consent_accepted_at timestamptz,
    p_session2_order      jsonb
)
    returns table(
        session_id uuid,
        slot integer,
        test_order jsonb,
        lab_meeting_order_index smallint,
        order_source text,
        consent_version text,
        consent_accepted_at timestamptz,
        complete boolean,
        status text
    )
    language plpgsql
as $$
declare
    v_existing study_sessions%rowtype;
    v_s1       study_sessions%rowtype;
    v_slot     integer;
    v_order    jsonb;
    v_order_index smallint;
    v_order_source text;
    v_consent_version text;
    v_consent_accepted_at timestamptz;
begin
    if not exists (select 1 from study_codes where code = p_code) then
        return query select null::uuid, null::integer, null::jsonb, null::smallint,
            null::text, null::text, null::timestamptz, false, 'unknown_code'::text;
        return;
    end if;

    select * into v_existing from study_sessions s
        where s.study_code = p_code and s.session_number = p_session_number and s.reset_at is null
        for update;
    if found then
        if p_session_number = 1 and v_existing.lab_meeting_order_index is distinct from p_order_index then
            return query select v_existing.id, v_existing.slot, v_existing.test_order,
                v_existing.lab_meeting_order_index, v_existing.order_source,
                v_existing.consent_version, v_existing.consent_accepted_at,
                v_existing.complete, 'order_mismatch'::text;
            return;
        end if;
        if v_existing.complete then
            return query select v_existing.id, v_existing.slot, v_existing.test_order,
                v_existing.lab_meeting_order_index, v_existing.order_source,
                v_existing.consent_version, v_existing.consent_accepted_at,
                true, 'complete'::text;
            return;
        end if;
        update study_sessions set session_token_hash = p_token_hash, updated_at = now()
            where id = v_existing.id;
        return query select v_existing.id, v_existing.slot, v_existing.test_order,
            v_existing.lab_meeting_order_index, v_existing.order_source,
            v_existing.consent_version, v_existing.consent_accepted_at,
            false, 'resumed'::text;
        return;
    end if;

    if p_session_number = 1 then
        if p_order_index is null or p_order_index < 0 or p_order_index > 5
           or p_session1_order is null or jsonb_typeof(p_session1_order) <> 'array'
           or p_consent_version is null or p_consent_accepted_at is null then
            return query select null::uuid, null::integer, null::jsonb, null::smallint,
                null::text, null::text, null::timestamptz, false, 'invalid_start'::text;
            return;
        end if;
        select c.slot_id into v_slot from claim_slot(p_code) c;
        if v_slot is null or v_slot = -1 then
            return query select null::uuid, null::integer, null::jsonb, null::smallint,
                null::text, null::text, null::timestamptz, false, 'slots_full'::text;
            return;
        end if;
        v_order := p_session1_order;
        v_order_index := p_order_index;
        v_order_source := 'lab-meeting-url';
        v_consent_version := p_consent_version;
        v_consent_accepted_at := p_consent_accepted_at;
    else
        select * into v_s1 from study_sessions s
            where s.study_code = p_code and s.session_number = 1 and s.reset_at is null;
        if not found or not v_s1.complete then
            return query select null::uuid, null::integer, null::jsonb, null::smallint,
                null::text, null::text, null::timestamptz, false, 'session1_incomplete'::text;
            return;
        end if;
        v_slot := v_s1.slot;
        v_order := p_session2_order;
        v_order_index := null;
        v_order_source := 'session-2-fixed';
        v_consent_version := null;
        v_consent_accepted_at := null;
    end if;

    insert into study_sessions (
        study_code, session_number, slot, protocol_version, test_order,
        lab_meeting_order_index, order_source, consent_version, consent_accepted_at,
        session_token_hash
    ) values (
        p_code, p_session_number, v_slot, p_protocol, v_order,
        v_order_index, v_order_source, v_consent_version, v_consent_accepted_at,
        p_token_hash
    ) returning * into v_existing;

    return query select v_existing.id, v_existing.slot, v_existing.test_order,
        v_existing.lab_meeting_order_index, v_existing.order_source,
        v_existing.consent_version, v_existing.consent_accepted_at,
        false, 'started'::text;
end;
$$;

revoke execute on function start_session(
    text, smallint, text, text, jsonb, smallint, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function start_session(
    text, smallint, text, text, jsonb, smallint, text, timestamptz, jsonb
) to service_role;
