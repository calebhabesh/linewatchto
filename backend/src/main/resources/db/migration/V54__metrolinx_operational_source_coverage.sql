create table metrolinx_operational_source_records (
    source_system varchar(80) not null,
    source_id varchar(255) not null,
    payload jsonb not null,
    active boolean not null default true,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,
    primary key (source_system, source_id)
);

create index idx_metrolinx_operational_source_active
    on metrolinx_operational_source_records (source_system, active, last_seen_at desc);

create table metrolinx_ingestion_source_runs (
    run_id bigint not null references ingestion_runs(id) on delete cascade,
    source_system varchar(80) not null,
    required boolean not null,
    complete boolean not null,
    records_fetched integer not null default 0 check (records_fetched >= 0),
    source_feed_updated_at timestamptz,
    primary key (run_id, source_system)
);

create index idx_metrolinx_ingestion_source_runs_source
    on metrolinx_ingestion_source_runs (source_system, run_id desc);
