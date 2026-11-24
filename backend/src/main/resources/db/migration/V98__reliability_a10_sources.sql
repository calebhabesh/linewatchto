-- Plan 17 A10: new reliability context sources (each independently gated, never merged into
-- LineWatchTO-observed disruption minutes):
--   - D5: GO/UP on-time performance (regional_scheduled_trip_counts, regional_trip_observations)
--   - D6: TTC official subway delay log (ttc_official_delay_imports, ttc_official_delay_incidents)
--   - Official TTC performance history (ttc_performance_readings)

create table regional_scheduled_trip_counts (
    source_system varchar(16) not null check (source_system in ('go', 'up')),
    line_id varchar(120) not null,
    service_date date not null,
    scheduled_trips integer not null check (scheduled_trips >= 0),
    captured_at timestamptz not null,
    primary key (source_system, line_id, service_date)
);

create index idx_regional_scheduled_trip_counts_line_date
    on regional_scheduled_trip_counts (line_id, service_date);

create table regional_trip_observations (
    id bigserial primary key,
    source_system varchar(16) not null check (source_system in ('go', 'up')),
    service_date date not null,
    trip_id varchar(140) not null,
    trip_number varchar(40),
    line_id varchar(120) not null,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,
    latest_delay_seconds integer,
    terminal_arrival_delay_seconds integer,
    observed_stop_count integer not null default 0 check (observed_stop_count >= 0),
    cancelled boolean not null default false,
    updated_at timestamptz not null,
    unique (source_system, service_date, trip_id)
);

create index idx_regional_trip_observations_date_line
    on regional_trip_observations (service_date, line_id);

create index idx_regional_trip_observations_source_date
    on regional_trip_observations (source_system, service_date);

create table ttc_official_delay_imports (
    id bigserial primary key,
    resource_url text not null,
    resource_last_modified varchar(80),
    min_date date,
    max_date date,
    row_count integer not null default 0 check (row_count >= 0),
    imported_at timestamptz not null
);

create table ttc_official_delay_incidents (
    id bigserial primary key,
    source_row_id integer not null,
    incident_date date not null,
    incident_time varchar(16),
    day_of_week varchar(16),
    line_id varchar(40) not null,
    raw_line varchar(40) not null,
    station_name varchar(160),
    delay_code varchar(32),
    delay_code_description varchar(240),
    min_delay integer not null check (min_delay >= 0),
    min_gap integer not null check (min_gap >= 0),
    bound varchar(16),
    vehicle varchar(32),
    imported_at timestamptz not null,
    unique (incident_date, source_row_id)
);

create index idx_ttc_official_delay_incidents_date_line
    on ttc_official_delay_incidents (incident_date, line_id);

create index idx_ttc_official_delay_incidents_code
    on ttc_official_delay_incidents (delay_code);

create table ttc_performance_readings (
    id bigserial primary key,
    metric_key varchar(80) not null,
    label varchar(120) not null,
    category varchar(80),
    percentage integer,
    target integer,
    value_label varchar(60),
    updated_label varchar(120) not null default '',
    reading_date date not null,
    fetched_at timestamptz not null,
    source_url varchar(240),
    unique (metric_key, reading_date, updated_label)
);

create index idx_ttc_performance_readings_date_metric
    on ttc_performance_readings (reading_date, metric_key);
