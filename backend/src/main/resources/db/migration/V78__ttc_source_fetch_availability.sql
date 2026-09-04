alter table ingestion_runs
    add column source_fetch_status varchar(32),
    add column source_http_status integer,
    add column source_response_ms bigint;

alter table ingestion_runs
    add constraint ingestion_runs_source_fetch_status_check
    check (source_fetch_status in (
        'success',
        'timeout',
        'http-error',
        'invalid-response',
        'request-error'
    ));

create index idx_ingestion_runs_ttc_source_availability
    on ingestion_runs (started_at desc)
    where run_type = 'alerts' and source_fetch_status is not null;
