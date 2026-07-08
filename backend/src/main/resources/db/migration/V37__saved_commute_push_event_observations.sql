create table push_saved_commute_event_observations (
    id varchar(120) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    commute_id varchar(80) references saved_commutes(id) on delete set null,
    leg_id varchar(40),
    category varchar(60) not null,
    line_id varchar(32),
    event_type varchar(40) not null,
    notification_key varchar(512) not null,
    source_incident_key varchar(512) not null,
    notification_subject varchar(120) not null,
    event_location text,
    display_direction varchar(120),
    scope_label varchar(180),
    source_event_at timestamp with time zone,
    url varchar(512) not null,
    observed_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    cleared_at timestamp with time zone,
    unique (account_id, source_incident_key)
);

create index idx_push_saved_commute_event_observations_account_active
    on push_saved_commute_event_observations(account_id, last_seen_at desc)
    where cleared_at is null;

create index idx_push_saved_commute_event_observations_commute_active
    on push_saved_commute_event_observations(account_id, commute_id, leg_id, last_seen_at desc)
    where cleared_at is null;

create index idx_push_saved_commute_event_observations_source_active
    on push_saved_commute_event_observations(account_id, source_incident_key, last_seen_at desc)
    where cleared_at is null;

insert into push_saved_commute_event_observations (
    id,
    account_id,
    commute_id,
    leg_id,
    category,
    line_id,
    event_type,
    notification_key,
    source_incident_key,
    notification_subject,
    event_location,
    display_direction,
    scope_label,
    source_event_at,
    url,
    observed_at,
    last_seen_at,
    cleared_at
)
select
    'saved_commute_obs_' || md5(account_id || '|' || source_incident_key),
    account_id,
    commute_id,
    leg_id,
    category,
    line_id,
    event_type,
    notification_key,
    source_incident_key,
    notification_subject,
    event_location,
    display_direction,
    scope_label,
    source_event_at,
    url,
    created_at,
    created_at,
    null
from push_notification_events
where category in ('saved-commute-current', 'saved-commute-impact')
  and notification_state = 'ACTIVE'
  and commute_id is not null
  and source_incident_key is not null
  and notification_key is not null
on conflict (account_id, source_incident_key) do nothing;
