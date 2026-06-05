create table gtfs_schedule_imports (
    id bigserial primary key,
    source_name varchar(120) not null,
    source_url text not null,
    imported_at timestamptz not null,
    service_start date,
    service_end date,
    active boolean not null default true
);

create unique index idx_gtfs_schedule_imports_one_active
    on gtfs_schedule_imports(active)
    where active = true;

create table gtfs_routes (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    route_id varchar(120) not null,
    line_id varchar(20) not null,
    route_short_name varchar(20) not null,
    route_long_name text,
    primary key (import_id, route_id),
    constraint chk_gtfs_routes_rapid_transit
        check (route_short_name in ('1', '2', '4', '5', '6'))
);

create table gtfs_stops (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    stop_id varchar(120) not null,
    stop_name text not null,
    parent_station varchar(120),
    primary key (import_id, stop_id)
);

create table gtfs_services (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    service_id varchar(120) not null,
    monday boolean not null,
    tuesday boolean not null,
    wednesday boolean not null,
    thursday boolean not null,
    friday boolean not null,
    saturday boolean not null,
    sunday boolean not null,
    start_date date not null,
    end_date date not null,
    primary key (import_id, service_id)
);

create table gtfs_service_exceptions (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    service_id varchar(120) not null,
    service_date date not null,
    exception_type integer not null,
    primary key (import_id, service_id, service_date)
);

create table gtfs_trips (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    trip_id varchar(160) not null,
    route_id varchar(120) not null,
    service_id varchar(120) not null,
    trip_headsign text,
    direction_id integer,
    primary key (import_id, trip_id),
    foreign key (import_id, route_id) references gtfs_routes(import_id, route_id) on delete cascade,
    foreign key (import_id, service_id) references gtfs_services(import_id, service_id) on delete cascade
);

create table gtfs_stop_times (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    trip_id varchar(160) not null,
    stop_id varchar(120) not null,
    arrival_seconds integer not null,
    departure_seconds integer not null,
    stop_sequence integer not null,
    primary key (import_id, trip_id, stop_sequence),
    foreign key (import_id, trip_id) references gtfs_trips(import_id, trip_id) on delete cascade,
    foreign key (import_id, stop_id) references gtfs_stops(import_id, stop_id) on delete cascade
);

create table gtfs_station_stops (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    line_id varchar(20) not null references transit_lines(id),
    stop_id varchar(120) not null,
    primary key (import_id, station_id, line_id, stop_id),
    foreign key (import_id, stop_id) references gtfs_stops(import_id, stop_id) on delete cascade
);

create index idx_gtfs_trips_service_lookup
    on gtfs_trips(import_id, service_id, route_id);

create index idx_gtfs_stop_times_station_lookup
    on gtfs_stop_times(import_id, stop_id, departure_seconds);

create index idx_gtfs_station_stops_station_line
    on gtfs_station_stops(import_id, station_id, line_id);
