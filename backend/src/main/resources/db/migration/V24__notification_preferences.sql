create table push_notification_preferences (
    account_id varchar(80) primary key references accounts(id) on delete cascade,
    saved_commute_current_enabled boolean not null default true,
    saved_commute_planned_enabled boolean not null default true,
    saved_commute_suspension_enabled boolean not null default true,
    saved_commute_delay_enabled boolean not null default true,
    saved_commute_reduced_speed_zone_enabled boolean not null default true,
    saved_commute_planned_closure_enabled boolean not null default true,
    saved_commute_restored_enabled boolean not null default true,
    line_suspension_enabled boolean not null default true,
    line_delay_enabled boolean not null default true,
    line_reduced_speed_zone_enabled boolean not null default false,
    line_planned_closure_enabled boolean not null default true,
    line_restored_enabled boolean not null default true,
    reminder_on_change_enabled boolean not null default true,
    reminder_closure_24h_enabled boolean not null default true,
    reminder_closure_morning_enabled boolean not null default true,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);

insert into push_notification_preferences (
    account_id,
    saved_commute_current_enabled,
    saved_commute_planned_enabled,
    created_at,
    updated_at
)
select
    account_id,
    bool_or(commute_notifications_enabled),
    bool_or(planned_closure_notifications_enabled),
    min(created_at),
    max(updated_at)
from push_subscriptions
group by account_id
on conflict (account_id) do nothing;

create table push_line_subscriptions (
    id varchar(120) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    line_id varchar(32) not null,
    enabled boolean not null default false,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    unique (account_id, line_id)
);

alter table push_notification_events
    alter column leg_id drop not null;

alter table push_notification_events
    add column line_id varchar(32);

alter table push_notification_events
    add column event_type varchar(40);

alter table push_notification_events
    add column reminder_bucket varchar(40);

update push_notification_events
set event_type = case
    when category = 'saved-commute-planned' then 'planned-closure'
    else 'service-impact'
end
where event_type is null;

update push_notification_events
set reminder_bucket = 'on-change'
where reminder_bucket is null;

alter table push_notification_events
    alter column event_type set not null;

alter table push_notification_events
    alter column reminder_bucket set not null;

create index idx_push_line_subscriptions_account_enabled
    on push_line_subscriptions(account_id, enabled);

create index idx_push_notification_preferences_updated
    on push_notification_preferences(updated_at desc);

create index idx_push_notification_events_line_state
    on push_notification_events(account_id, line_id, notification_state, created_at desc);
