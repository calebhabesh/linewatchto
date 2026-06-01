CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column to existing stations table
ALTER TABLE stations ADD COLUMN geom geometry(Point, 4326);

-- Line Segments connecting stations
CREATE TABLE line_segments (
    id varchar(120) primary key,
    line_id varchar(32) not null references transit_lines(id),
    station_a_id varchar(80) not null references stations(id),
    station_b_id varchar(80) not null references stations(id),
    geom geometry(LineString, 4326),
    svg_path varchar(255) not null,
    sort_order integer not null,
    unique(station_a_id, station_b_id)
);

-- Normalized Alerts table (replacing or augmenting station_impacts)
CREATE TABLE alerts (
    id varchar(120) primary key,
    source_id varchar(120) not null unique,
    type varchar(32) not null,
    severity varchar(32) not null,
    title varchar(160) not null,
    description text not null,
    active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    check (type in ('active-alert', 'planned-closure')),
    check (severity in ('delay', 'suspension', 'planned'))
);

-- Link alerts to the exact line segments they affect
CREATE TABLE alert_segments (
    alert_id varchar(120) not null references alerts(id),
    segment_id varchar(120) not null references line_segments(id),
    primary key (alert_id, segment_id)
);

-- Historical alert snapshots for reliability aggregation
CREATE TABLE snapshots (
    id bigserial primary key,
    alert_id varchar(120) not null references alerts(id),
    severity varchar(32) not null,
    description text not null,
    snapshot_time timestamp with time zone not null default now()
);

-- Ingestion tracking
CREATE TABLE ingestion_runs (
    id bigserial primary key,
    run_type varchar(32) not null,
    status varchar(32) not null,
    started_at timestamp with time zone not null default now(),
    completed_at timestamp with time zone,
    records_processed integer not null default 0,
    error_message text,
    check (run_type in ('alerts', 'gtfs-static')),
    check (status in ('running', 'success', 'failed'))
);
