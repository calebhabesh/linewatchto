alter table regional_gtfs_departures
    add column trip_short_name varchar(120) not null default '',
    add column stop_sequence integer;

create index idx_regional_gtfs_trip_identity
    on regional_gtfs_departures (import_id, trip_id, trip_short_name);

