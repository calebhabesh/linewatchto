create table push_subscriptions (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    endpoint text not null,
    endpoint_hash varchar(64) not null,
    p256dh_key text not null,
    auth_secret text not null,
    user_agent varchar(255),
    enabled boolean not null default true,
    commute_notifications_enabled boolean not null default true,
    planned_closure_notifications_enabled boolean not null default true,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    disabled_at timestamp with time zone,
    unique (account_id, endpoint_hash)
);

create table push_notification_events (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    commute_id varchar(80) references saved_commutes(id) on delete set null,
    leg_id varchar(24) not null,
    category varchar(80) not null,
    dedupe_key varchar(512) not null unique,
    title varchar(120) not null,
    body varchar(240) not null,
    url varchar(512) not null,
    created_at timestamp with time zone not null
);

create table push_notification_deliveries (
    id varchar(80) primary key,
    event_id varchar(80) not null references push_notification_events(id) on delete cascade,
    subscription_id varchar(80) not null references push_subscriptions(id) on delete cascade,
    status varchar(32) not null,
    http_status integer,
    message varchar(255),
    created_at timestamp with time zone not null,
    displayed_at timestamp with time zone,
    unique (event_id, subscription_id)
);

create index idx_push_subscriptions_account_enabled
    on push_subscriptions(account_id, enabled);

create index idx_push_notification_events_account_created
    on push_notification_events(account_id, created_at desc);

create index idx_push_notification_deliveries_subscription_displayed
    on push_notification_deliveries(subscription_id, displayed_at, created_at desc);
