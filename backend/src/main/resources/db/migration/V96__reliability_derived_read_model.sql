-- Plan 17 A5: derived read model for reliability analytics (methodology v1+).
-- Episodes hold each counted disruption's identity, metadata and full counted multirange
-- (occurrence ∩ polling ∩ disjoint line service spans). Daily tables hold per-service-date
-- minutes for lines and stations so any range sums compact rows instead of scanning raw
-- snapshots or schedules. A methodology change builds version N+1 beside version N, then
-- switches reliability_methodology in one transaction.

create table reliability_episodes (
    id bigserial primary key,
    methodology_version integer not null,
    network_id varchar(16) not null,
    episode_key varchar(240) not null,
    alert_id varchar(180) not null,
    line_id varchar(120) not null,
    impact_kind varchar(40) not null,
    cause varchar(64),
    station_ids jsonb not null default '[]'::jsonb,
    opened_at timestamptz not null,
    closed_at timestamptz,
    counted tstzmultirange not null,
    counted_minutes integer not null,
    completed boolean not null,
    unique (methodology_version, network_id, episode_key),
    constraint chk_reliability_episodes_version check (methodology_version >= 1),
    constraint chk_reliability_episodes_network check (network_id in ('ttc', 'regional')),
    constraint chk_reliability_episodes_counted_minutes check (counted_minutes >= 0)
);

create index idx_reliability_episodes_counted
    on reliability_episodes using gist (counted);

create index idx_reliability_episodes_version_network_line_opened
    on reliability_episodes (methodology_version, network_id, line_id, opened_at);

create index idx_reliability_episodes_station_ids
    on reliability_episodes using gin (station_ids);

create table reliability_line_days (
    methodology_version integer not null,
    network_id varchar(16) not null,
    line_id varchar(120) not null,
    service_date date not null,
    impact_group varchar(40) not null,
    scheduled_minutes integer not null,
    observed_minutes integer not null,
    impacted_minutes integer not null,
    incident_minutes integer not null,
    derived_at timestamptz not null,
    primary key (methodology_version, network_id, line_id, service_date, impact_group),
    constraint chk_reliability_line_days_version check (methodology_version >= 1),
    constraint chk_reliability_line_days_network check (network_id in ('ttc', 'regional')),
    constraint chk_reliability_line_days_minutes check (
        scheduled_minutes >= 0 and observed_minutes >= 0
        and impacted_minutes >= 0 and incident_minutes >= 0
    )
);

create index idx_reliability_line_days_version_network_date
    on reliability_line_days (methodology_version, network_id, service_date);

create table reliability_station_days (
    methodology_version integer not null,
    network_id varchar(16) not null,
    line_id varchar(120) not null,
    station_id varchar(80) not null,
    service_date date not null,
    impact_group varchar(40) not null,
    scheduled_minutes integer not null,
    observed_minutes integer not null,
    impacted_minutes integer not null,
    incident_minutes integer not null,
    derived_at timestamptz not null,
    primary key (methodology_version, network_id, line_id, station_id, service_date, impact_group),
    constraint chk_reliability_station_days_version check (methodology_version >= 1),
    constraint chk_reliability_station_days_network check (network_id in ('ttc', 'regional')),
    constraint chk_reliability_station_days_minutes check (
        scheduled_minutes >= 0 and observed_minutes >= 0
        and impacted_minutes >= 0 and incident_minutes >= 0
    )
);

create index idx_reliability_station_days_version_network_station_date
    on reliability_station_days (methodology_version, network_id, station_id, service_date);

create table reliability_derivations (
    methodology_version integer not null,
    network_id varchar(16) not null,
    derived_through date,
    status varchar(24) not null,
    last_started_at timestamptz,
    last_succeeded_at timestamptz,
    last_failed_at timestamptz,
    last_duration_ms bigint,
    consecutive_failures integer not null default 0,
    last_error text,
    updated_at timestamptz not null default now(),
    primary key (methodology_version, network_id),
    constraint chk_reliability_derivations_version check (methodology_version >= 1),
    constraint chk_reliability_derivations_network check (network_id in ('ttc', 'regional')),
    constraint chk_reliability_derivations_status check (status in ('never-run', 'running', 'success', 'failed')),
    constraint chk_reliability_derivations_failures check (consecutive_failures >= 0)
);

create table reliability_methodology (
    id smallint primary key check (id = 1),
    current_version integer not null check (current_version >= 1),
    switched_at timestamptz not null default now()
);

insert into reliability_methodology (id, current_version) values (1, 1);
