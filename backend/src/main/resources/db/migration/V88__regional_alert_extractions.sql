-- Optional language-model readings of Metrolinx notice text, keyed by the text they read so a
-- notice is extracted once per model and prompt version. Rows hold public notice text and the
-- validated reading only; credentials and provider responses are never stored.
create table regional_alert_extractions (
    id bigserial primary key,
    input_hash char(64) not null,
    model varchar(80) not null,
    prompt_version varchar(32) not null,
    canonical_event_id varchar(255) not null,
    input jsonb not null,
    status varchar(16) not null
        check (status in ('pending', 'succeeded', 'rejected', 'failed')),
    attempts integer not null default 0,
    next_attempt_at timestamptz not null,
    last_error varchar(64),
    result jsonb,
    deterministic jsonb,
    differences jsonb,
    applies_until timestamptz,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,
    completed_at timestamptz,
    unique (input_hash, model, prompt_version)
);

create index idx_regional_alert_extractions_due
    on regional_alert_extractions (next_attempt_at)
    where status = 'pending';

create index idx_regional_alert_extractions_last_seen
    on regional_alert_extractions (last_seen_at);

-- Requests sent per Pacific-time day (when Gemini daily quotas reset), so a free-tier daily
-- quota is not exceeded.
create table regional_alert_extraction_usage (
    usage_date date not null,
    model varchar(80) not null,
    requests integer not null default 0,
    primary key (usage_date, model)
);
