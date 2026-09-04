create index idx_ingestion_runs_type_status_completed
    on ingestion_runs (run_type, completed_at desc)
    where status = 'success' and completed_at is not null;
