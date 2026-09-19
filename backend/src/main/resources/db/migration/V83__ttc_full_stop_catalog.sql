alter table gtfs_schedule_imports
    add column full_stop_catalog_available boolean not null default false;
