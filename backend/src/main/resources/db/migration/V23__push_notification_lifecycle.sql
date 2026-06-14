alter table push_notification_events
    add column notification_key varchar(512);

update push_notification_events
set notification_key = category || '|' || coalesce(commute_id, '') || '|' || dedupe_key
where notification_key is null;

alter table push_notification_events
    alter column notification_key set not null;

alter table push_notification_events
    add column notification_state varchar(24) not null default 'ACTIVE';

create index idx_push_notification_events_account_state
    on push_notification_events(account_id, notification_state, created_at desc);

create index idx_push_notification_events_key_state
    on push_notification_events(notification_key, notification_state, created_at desc);
