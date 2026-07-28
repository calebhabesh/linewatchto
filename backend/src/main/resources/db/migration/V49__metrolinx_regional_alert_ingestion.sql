create table metrolinx_alert_source_records (
    source_system varchar(80) not null,
    source_id varchar(255) not null,
    payload jsonb not null,
    active boolean not null default true,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,
    primary key (source_system, source_id)
);

create index idx_metrolinx_alert_source_active
    on metrolinx_alert_source_records (source_system, active, last_seen_at desc);

create table regional_alerts (
    id varchar(255) primary key,
    source_system varchar(80) not null,
    source_id varchar(255) not null,
    line_id varchar(80) not null,
    impact_kind varchar(40) not null check (
        impact_kind in ('delay', 'suspension', 'planned-closure')
    ),
    title varchar(500) not null,
    description text not null,
    cause varchar(255),
    active_period_start timestamptz,
    active_period_end timestamptz,
    source_updated_at timestamptz,
    station_ids jsonb not null default '[]'::jsonb,
    affected_segment_ids jsonb not null default '[]'::jsonb,
    active boolean not null default true,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    unique (source_system, source_id, line_id)
);

create index idx_regional_alerts_active_line
    on regional_alerts (active, line_id, impact_kind);

create index idx_ingestion_runs_metrolinx_alerts
    on ingestion_runs (started_at desc)
    where run_type = 'metrolinx-alerts';
