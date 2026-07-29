create table regional_gtfs_schedule_imports (
    id bigserial primary key,
    source_system varchar(20) not null,
    source_url text not null,
    imported_at timestamptz not null,
    service_start date,
    service_end date,
    active boolean not null default false,
    constraint chk_regional_gtfs_source check (source_system in ('go', 'up'))
);

create unique index idx_regional_gtfs_one_active_per_source
    on regional_gtfs_schedule_imports(source_system)
    where active = true;

create table regional_gtfs_services (
    import_id bigint not null references regional_gtfs_schedule_imports(id) on delete cascade,
    service_id varchar(160) not null,
    monday boolean not null,
    tuesday boolean not null,
    wednesday boolean not null,
    thursday boolean not null,
    friday boolean not null,
    saturday boolean not null,
    sunday boolean not null,
    start_date date,
    end_date date,
    primary key (import_id, service_id)
);

create table regional_gtfs_service_exceptions (
    import_id bigint not null references regional_gtfs_schedule_imports(id) on delete cascade,
    service_id varchar(160) not null,
    service_date date not null,
    exception_type integer not null,
    primary key (import_id, service_id, service_date)
);

create table regional_gtfs_departures (
    import_id bigint not null references regional_gtfs_schedule_imports(id) on delete cascade,
    station_id varchar(80) not null,
    line_id varchar(30) not null,
    service_id varchar(160) not null,
    trip_id varchar(200) not null,
    direction text not null,
    departure_seconds integer not null,
    platform varchar(80) not null default '',
    primary key (import_id, trip_id, station_id, departure_seconds)
);

create index idx_regional_gtfs_departure_lookup
    on regional_gtfs_departures(import_id, station_id, line_id, service_id, departure_seconds);

create index idx_regional_gtfs_service_date_lookup
    on regional_gtfs_service_exceptions(import_id, service_date, service_id);
