create table ttc_station_notices (
    id varchar(180) primary key,
    station_id varchar(80) not null references stations(id),
    category varchar(32) not null,
    title varchar(300) not null,
    summary text not null,
    source_url varchar(700) not null,
    effective_start date,
    effective_end date,
    source_updated_at timestamp with time zone,
    last_verified_at timestamp with time zone not null,
    source varchar(120) not null,
    active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    check (category in ('construction', 'service-change', 'facility', 'other')),
    check (effective_end is null or effective_start is null or effective_end >= effective_start)
);

create index idx_ttc_station_notices_station_active
    on ttc_station_notices(station_id, active, sort_order);

create table ttc_station_page_observations (
    station_id varchar(80) primary key references stations(id),
    page_url varchar(700) not null,
    source_last_modified date,
    page_content_hash varchar(64) not null,
    notice_fingerprint varchar(64),
    notice_text text,
    notice_detail_url varchar(700),
    first_observed_at timestamp with time zone not null,
    last_checked_at timestamp with time zone not null
);

create table ttc_station_notice_candidates (
    id bigserial primary key,
    candidate_key varchar(64) not null unique,
    station_id varchar(80) not null references stations(id),
    change_type varchar(16) not null,
    page_url varchar(700) not null,
    source_last_modified date,
    previous_notice_fingerprint varchar(64),
    current_notice_fingerprint varchar(64),
    current_notice_text text,
    current_detail_url varchar(700),
    detected_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    review_status varchar(16) not null default 'pending',
    reviewed_at timestamp with time zone,
    review_notes text,
    check (change_type in ('added', 'changed', 'removed')),
    check (review_status in ('pending', 'approved', 'ignored'))
);

create index idx_ttc_station_notice_candidates_review
    on ttc_station_notice_candidates(review_status, detected_at desc);

create table ttc_station_notice_monitor_runs (
    id bigserial primary key,
    status varchar(16) not null,
    started_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    sitemap_pages_discovered integer not null default 0,
    mapped_station_pages integer not null default 0,
    pages_fetched integer not null default 0,
    pages_unchanged integer not null default 0,
    notice_changes integer not null default 0,
    candidates_staged integer not null default 0,
    page_failures integer not null default 0,
    error_message text,
    check (status in ('running', 'succeeded', 'partial', 'failed'))
);

create index idx_ttc_station_notice_monitor_runs_started
    on ttc_station_notice_monitor_runs(started_at desc);

insert into ttc_station_notices (
    id, station_id, category, title, summary, source_url,
    effective_start, effective_end, source_updated_at, last_verified_at,
    source, active, sort_order, created_at, updated_at
) values (
    'ttc-station-notice-warden-terminal-closure',
    'warden',
    'construction',
    'Warden Station bus terminal closure',
    'The bus terminal is closed for construction. Connecting routes use a temporary terminal or temporary on-street stops on Warden Avenue.',
    'https://www.ttc.ca/riding-the-ttc/Updates/Warden-Station-bus-terminal-closure',
    date '2025-01-05',
    null,
    null,
    timestamp with time zone '2026-08-31 00:00:00-04:00',
    'TTC station information',
    true,
    10,
    current_timestamp,
    current_timestamp
);
