alter table push_notification_events
    add column triggered_at timestamp with time zone;

update push_notification_events
set triggered_at = created_at
where triggered_at is null;

alter table push_notification_events
    alter column triggered_at set not null;
