-- Plan 17 A1: reliability keeps each service date's published schedule after the GTFS
-- import that held it is pruned. A schedule day records that a feed covered the date;
-- a span is one line's (station_id '') or one station's first-to-last departure that day.
-- A covered date with no trips on a line has a day and no span: zero scheduled minutes,
-- not missing coverage. Dates before yesterday (Toronto) are never rewritten.
create table reliability_schedule_days (
    network_id varchar(16) not null,
    source_system varchar(16) not null,
    service_date date not null,
    import_id bigint,
    feed_version text,
    source_kind varchar(16) not null,
    captured_at timestamptz not null,
    primary key (network_id, source_system, service_date),
    constraint chk_reliability_schedule_days_network check (network_id in ('ttc', 'regional')),
    constraint chk_reliability_schedule_days_source check (source_system in ('ttc', 'go', 'up')),
    constraint chk_reliability_schedule_days_kind check (source_kind in ('import', 'archive'))
);

create table reliability_service_spans (
    network_id varchar(16) not null,
    line_id varchar(120) not null,
    station_id varchar(80) not null default '',
    service_date date not null,
    source_system varchar(16) not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    primary key (network_id, line_id, station_id, service_date),
    check (ends_at > starts_at)
);

create index idx_reliability_service_spans_station_date
    on reliability_service_spans(network_id, station_id, service_date);

create index idx_reliability_service_spans_source_date
    on reliability_service_spans(network_id, source_system, service_date);
