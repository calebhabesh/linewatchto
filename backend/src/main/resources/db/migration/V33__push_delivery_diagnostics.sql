alter table push_notification_deliveries
    add column attempt_count integer not null default 1;

create table push_notification_client_events (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    subscription_id varchar(80) references push_subscriptions(id) on delete set null,
    delivery_id varchar(80) references push_notification_deliveries(id) on delete set null,
    endpoint_hash varchar(64) not null,
    notification_key varchar(512) not null,
    notification_state varchar(24) not null,
    stage varchar(48) not null,
    message varchar(255),
    occurred_at timestamp with time zone not null,
    created_at timestamp with time zone not null
);

create index idx_push_client_events_delivery_occurred
    on push_notification_client_events(delivery_id, occurred_at asc);

create index idx_push_client_events_account_created
    on push_notification_client_events(account_id, created_at desc);
