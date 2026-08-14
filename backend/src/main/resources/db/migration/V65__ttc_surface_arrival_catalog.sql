create table ttc_surface_routes (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    route_id varchar(120) not null,
    route_short_name varchar(20) not null,
    route_long_name text,
    mode varchar(20) not null,
    primary key (import_id, route_id),
    constraint chk_ttc_surface_routes_mode check (mode in ('bus', 'streetcar'))
);

create table ttc_surface_station_stops (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    stop_id varchar(120) not null,
    station_id varchar(80) not null references stations(id),
    stop_name text not null,
    parent_station varchar(120) not null,
    bay_platform text,
    primary key (import_id, stop_id)
);

create table ttc_surface_trips (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    trip_id varchar(160) not null,
    route_id varchar(120) not null,
    trip_headsign text,
    primary key (import_id, trip_id),
    foreign key (import_id, route_id)
        references ttc_surface_routes(import_id, route_id) on delete cascade
);

create index idx_ttc_surface_station_stops_station
    on ttc_surface_station_stops(import_id, station_id);

create index idx_ttc_surface_trips_route
    on ttc_surface_trips(import_id, route_id);
