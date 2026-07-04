alter table push_subscriptions
    add column enabled_at timestamp with time zone;

update push_subscriptions
set enabled_at =
    case
        when enabled then coalesce(created_at, updated_at, last_seen_at, now())
        else coalesce(disabled_at, updated_at, created_at, now())
    end;

alter table push_subscriptions
    alter column enabled_at set not null;
