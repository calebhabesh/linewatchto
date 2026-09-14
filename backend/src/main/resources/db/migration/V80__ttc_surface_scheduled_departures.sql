alter table ttc_surface_trips add column service_id varchar(120);
alter table gtfs_schedule_imports add column surface_schedule_available boolean not null default false;

create table ttc_surface_stop_times (
    import_id bigint not null,
    trip_id varchar(160) not null,
    stop_id varchar(120) not null,
    stop_sequence integer not null,
    departure_seconds integer not null check (departure_seconds >= 0),
    primary key (import_id, trip_id, stop_sequence),
    foreign key (import_id, trip_id) references ttc_surface_trips(import_id, trip_id) on delete cascade,
    foreign key (import_id, stop_id) references ttc_surface_station_stops(import_id, stop_id) on delete cascade
);
create index idx_ttc_surface_departures_stop on ttc_surface_stop_times(import_id, stop_id, departure_seconds);
