create table ttc_alert_source_records (
    source_section varchar(32) not null,
    source_id varchar(120) not null,
    route_type varchar(80),
    source_updated_at timestamp with time zone,
    payload text not null,
    active boolean not null default true,
    first_seen_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    primary key (source_section, source_id),
    check (source_section in ('routes', 'accessibility'))
);

alter table alerts
    alter column title type varchar(500),
    add column line_id varchar(32) references transit_lines(id),
    add column source_alert_type varchar(32),
    add column effect varchar(80),
    add column effect_description varchar(160),
    add column direction varchar(160),
    add column cause varchar(80),
    add column cause_description varchar(160),
    add column start_station_id varchar(80) references stations(id),
    add column end_station_id varchar(80) references stations(id),
    add column active_period_start timestamp with time zone,
    add column active_period_end timestamp with time zone,
    add column source_updated_at timestamp with time zone,
    add column shuttle_type varchar(80),
    add column shuttle_start varchar(160),
    add column shuttle_end varchar(160),
    add column raw_payload text,
    add column normalized_fingerprint varchar(64);

create table alert_stations (
    alert_id varchar(120) not null references alerts(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    sort_order integer not null,
    primary key (alert_id, station_id)
);

create table alert_active_periods (
    alert_id varchar(120) not null references alerts(id) on delete cascade,
    source_period_id varchar(120) not null,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    sort_order integer not null,
    primary key (alert_id, source_period_id)
);

create table accessibility_outages (
    id varchar(160) primary key,
    source_id varchar(120) not null unique,
    asset_type varchar(32) not null,
    title varchar(500) not null,
    description text not null,
    effect varchar(80),
    effect_description varchar(160),
    active_period_start timestamp with time zone,
    active_period_end timestamp with time zone,
    source_updated_at timestamp with time zone,
    active boolean not null default true,
    raw_payload text not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    check (asset_type in ('elevator', 'escalator'))
);

create table accessibility_outage_stations (
    outage_id varchar(160) not null references accessibility_outages(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    primary key (outage_id, station_id)
);

alter table snapshots
    add column active boolean not null default true,
    add column source_updated_at timestamp with time zone;

alter table ingestion_runs
    add column records_fetched integer not null default 0,
    add column records_staged integer not null default 0,
    add column records_normalized integer not null default 0,
    add column records_unmatched integer not null default 0,
    add column source_feed_updated_at timestamp with time zone;

create index idx_ttc_alert_source_records_active
    on ttc_alert_source_records(active);
create index idx_alerts_active_line_id
    on alerts(line_id, active);
create index idx_alert_stations_station_id
    on alert_stations(station_id);
create index idx_accessibility_outages_active
    on accessibility_outages(active);
create index idx_accessibility_outage_stations_station_id
    on accessibility_outage_stations(station_id);
create index idx_ingestion_runs_type_started_at
    on ingestion_runs(run_type, started_at desc);
