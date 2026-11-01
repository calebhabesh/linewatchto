-- Plan 12 (notification delivery): installation continuity and device-side
-- replacement records. Hashes only; no raw endpoint is added anywhere.

-- When an installation's push enablement began. A replacement endpoint of the
-- same installation inherits it, so catch-up can judge eligibility by the
-- installation rather than by the new endpoint.
alter table push_subscriptions
    add column installation_enabled_at timestamp with time zone,
    add column browser_major_version integer,
    add column display_mode varchar(16);

update push_subscriptions
set installation_enabled_at = enabled_at
where installation_enabled_at is null;

-- Worker stage reports may arrive with no current endpoint (subscription lost).
alter table push_subscription_lifecycle_events
    alter column endpoint_hash drop not null,
    add column previous_endpoint_hash varchar(64),
    add column browser_major_version integer,
    add column display_mode varchar(16),
    add column detail varchar(255);

create index idx_push_subscription_lifecycle_account_type_time
    on push_subscription_lifecycle_events(account_id, event_type, occurred_at desc);

alter table push_notification_deliveries
    add column catch_up boolean not null default false;
