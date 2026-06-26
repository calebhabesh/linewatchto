create table push_line_event_observations (
    id varchar(120) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    line_id varchar(32) not null,
    event_type varchar(40) not null,
    notification_key varchar(512) not null,
    notification_subject varchar(120) not null,
    event_location text,
    scope_label varchar(180),
    source_event_at timestamp with time zone,
    url varchar(512) not null,
    observed_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    cleared_at timestamp with time zone,
    unique (account_id, notification_key)
);

create index idx_push_line_event_observations_account_active
    on push_line_event_observations(account_id, last_seen_at desc)
    where cleared_at is null;

create index idx_push_line_event_observations_line_active
    on push_line_event_observations(account_id, line_id, event_type, last_seen_at desc)
    where cleared_at is null;

alter table push_notification_preferences
    alter column line_reduced_speed_zone_enabled set default true;

insert into push_line_event_observations (
    id,
    account_id,
    line_id,
    event_type,
    notification_key,
    notification_subject,
    event_location,
    scope_label,
    source_event_at,
    url,
    observed_at,
    last_seen_at,
    cleared_at
)
select
    'line_obs_' || md5(account_id || '|' || notification_key),
    account_id,
    line_id,
    event_type,
    notification_key,
    notification_subject,
    event_location,
    scope_label,
    source_event_at,
    url,
    created_at,
    created_at,
    null
from push_notification_events
where category = 'line-current'
  and notification_state = 'ACTIVE'
  and line_id is not null
  and notification_key is not null
on conflict (account_id, notification_key) do nothing;
