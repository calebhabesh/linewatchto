create table push_evaluation_health (
    id varchar(32) primary key,
    last_started_at timestamp with time zone,
    last_succeeded_at timestamp with time zone,
    last_failed_at timestamp with time zone,
    consecutive_failures integer not null default 0,
    last_accounts_evaluated integer not null default 0,
    last_accounts_failed integer not null default 0,
    last_error varchar(1000),
    updated_at timestamp with time zone not null
);
