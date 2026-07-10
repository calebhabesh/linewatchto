create table push_subscription_lifecycle_events (
    id varchar(100) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    subscription_id varchar(80) references push_subscriptions(id) on delete set null,
    endpoint_hash varchar(64) not null,
    event_type varchar(48) not null,
    reason varchar(80) not null,
    occurred_at timestamp with time zone not null
);

create index idx_push_subscription_lifecycle_account_time
    on push_subscription_lifecycle_events(account_id, occurred_at desc);
