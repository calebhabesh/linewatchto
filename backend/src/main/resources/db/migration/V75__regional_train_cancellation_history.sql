create table regional_train_cancellations (
    id bigserial primary key,
    service_date date not null,
    line_id varchar(120) not null,
    trip_id varchar(255) not null,
    trip_number varchar(255) not null,
    scheduled_start_at timestamptz,
    schedule_matched boolean not null default false,
    station_ids jsonb not null default '[]'::jsonb,
    source_systems jsonb not null default '[]'::jsonb,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,
    unique (service_date, line_id, trip_number)
);

create index idx_regional_train_cancellations_period
    on regional_train_cancellations (service_date desc, line_id);

create index idx_regional_train_cancellations_first_seen
    on regional_train_cancellations (first_seen_at desc);

create table regional_train_cancellation_tracking (
    id smallint primary key check (id = 1),
    started_at timestamptz not null
);
