-- Admin panel (/admin): researcher-set study settings and an audit trail.
--
-- study_settings holds values researchers change during the study, e.g. the
-- current Pearson Q-global group session code ('raven_group_code'), which the
-- Raven hand-off screen shows to participants. Babak overwrites it per session.

create table if not exists study_settings (
    key         text primary key,
    value       text not null,
    updated_at  timestamptz not null default now(),
    updated_by  text not null          -- researcher email, or 'researcher-key' for scripts
);

-- Every admin change (setting a code, resetting a visit), who made it, and when.
create table if not exists admin_audit (
    id          bigint generated always as identity primary key,
    at          timestamptz not null default now(),
    researcher  text not null,
    action      text not null,
    detail      jsonb not null default '{}'::jsonb
);

alter table study_settings enable row level security;
alter table admin_audit    enable row level security;
