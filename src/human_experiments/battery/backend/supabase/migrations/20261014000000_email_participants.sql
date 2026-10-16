-- Participants identify with their Stony Brook email instead of a pre-issued
-- study code (Babak, 2026-10-13 meeting; deviates from the IRB anonymization
-- plan, risk accepted by the PI).
--
-- The email lives ONLY in this table. On first consent the server mints an
-- internal random code (P-XXXXXXXX) and every session and event row keeps
-- using that code, so deleting the emails later (after sessions are verified)
-- leaves the study data intact and deidentified.

create table if not exists participants (
    email       text primary key
                check (email ~ '^[a-z0-9][a-z0-9._%+-]{0,63}@stonybrook\.edu$'),
    study_code  text not null unique references study_codes(code),
    created_at  timestamptz not null default now()
);

alter table participants enable row level security;

-- Returns the code for an email, creating the participant (with p_new_code)
-- when p_create is true and the email is new. Returns null for an unknown
-- email when p_create is false. Serialized per email, so two simultaneous
-- first logins with the same email get the same code.
create or replace function participant_code(p_email text, p_new_code text, p_create boolean)
    returns text
    language plpgsql
as $$
declare
    v_code text;
begin
    perform pg_advisory_xact_lock(hashtext('participant:' || p_email));
    select p.study_code into v_code from participants p where p.email = p_email;
    if found or not p_create then
        return v_code;
    end if;
    insert into study_codes (code) values (p_new_code);
    insert into participants (email, study_code) values (p_email, p_new_code);
    return p_new_code;
end;
$$;

revoke execute on function participant_code(text, text, boolean) from public, anon, authenticated;
grant execute on function participant_code(text, text, boolean) to service_role;
