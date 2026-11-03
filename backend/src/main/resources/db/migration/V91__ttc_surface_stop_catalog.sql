-- Every TTC surface stop (bus and streetcar), not only the stops linked to a subway
-- station, so departures can be read by the number on the stop pole.
create table ttc_surface_stops (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    stop_id varchar(120) not null,
    stop_code varchar(40),
    stop_name text not null,
    latitude double precision,
    longitude double precision,
    station_id varchar(80) references stations(id),
    bay_platform text,
    primary key (import_id, stop_id)
);

create index idx_ttc_surface_stops_code on ttc_surface_stops(import_id, stop_code);
create index idx_ttc_surface_stops_code_any_import on ttc_surface_stops(stop_code);

-- Routes and destinations that board at a stop (last stops and no-pickup rows excluded).
create table ttc_surface_stop_routes (
    import_id bigint not null,
    stop_id varchar(120) not null,
    route_id varchar(120) not null,
    destination text not null default '',
    primary key (import_id, stop_id, route_id, destination),
    foreign key (import_id, stop_id) references ttc_surface_stops(import_id, stop_id) on delete cascade
);

-- Scheduled departures now cover every surface stop, so the station-stop key no longer
-- applies. Rows go with their import directly; the trip key stays.
alter table ttc_surface_stop_times drop constraint ttc_surface_stop_times_import_id_stop_id_fkey;
alter table ttc_surface_stop_times
    add constraint ttc_surface_stop_times_import_fkey
    foreign key (import_id) references gtfs_schedule_imports(id) on delete cascade;

-- An import made before this migration has no stop catalog and only station-stop
-- schedules; the refresh job re-imports the same package until this is set.
alter table gtfs_schedule_imports
    add column surface_stop_catalog_available boolean not null default false;
