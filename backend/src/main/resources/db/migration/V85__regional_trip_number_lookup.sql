-- Trip-change matching looked up trip numbers with leading-wildcard LIKE, scanning every departure
-- of the active import per lookup. Store the final trip_id segment so lookups can use an index.
alter table regional_gtfs_departures
    add column trip_number varchar(200)
        generated always as (substring(trip_id from '[-_]([^-_]+)$')) stored;

create index idx_regional_gtfs_trip_number
    on regional_gtfs_departures (import_id, trip_number);

create index idx_regional_gtfs_trip_short_name
    on regional_gtfs_departures (import_id, trip_short_name)
    where trip_short_name <> '';

analyze regional_gtfs_departures;
