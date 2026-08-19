create table ttc_surface_station_connections (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    stop_id varchar(120) not null,
    route_id varchar(120) not null,
    mode varchar(20) not null,
    route_short_name varchar(20) not null,
    route_long_name text,
    destination text not null default '',
    bay_platform text,
    stop_name text not null,
    primary key (import_id, station_id, stop_id, route_id, destination)
);

create index idx_ttc_surface_station_connections_station
    on ttc_surface_station_connections(import_id, station_id);
