alter table ingestion_runs
    drop constraint ingestion_runs_run_type_check;

alter table ingestion_runs
    add constraint ingestion_runs_run_type_check
    check (run_type in ('alerts', 'gtfs-static', 'gtfs-schedule'));
