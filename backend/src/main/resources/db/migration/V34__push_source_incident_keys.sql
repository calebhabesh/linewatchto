alter table push_notification_events
    add column source_incident_key varchar(512);

alter table push_line_event_observations
    add column source_incident_key varchar(512);

update push_notification_events
set source_incident_key =
    case
        when notification_key like 'line-%|%'
             and array_length(string_to_array(notification_key, '|'), 1) >= 4 then
            split_part(notification_key, '|', 1)
                || '|' || split_part(notification_key, '|', 2)
                || '|' || split_part(notification_key, '|', 4)
        when notification_key like 'saved-commute-%|%'
             and array_length(string_to_array(notification_key, '|'), 1) >= 5 then
            split_part(notification_key, '|', 1)
                || '|' || split_part(notification_key, '|', 2)
                || '|' || split_part(notification_key, '|', 3)
                || '|' || split_part(notification_key, '|', 5)
        else notification_key
    end
where source_incident_key is null;

update push_line_event_observations
set source_incident_key =
    case
        when notification_key like 'line-%|%'
             and array_length(string_to_array(notification_key, '|'), 1) >= 4 then
            split_part(notification_key, '|', 1)
                || '|' || split_part(notification_key, '|', 2)
                || '|' || split_part(notification_key, '|', 4)
        when notification_key like 'saved-commute-%|%'
             and array_length(string_to_array(notification_key, '|'), 1) >= 5 then
            split_part(notification_key, '|', 1)
                || '|' || split_part(notification_key, '|', 2)
                || '|' || split_part(notification_key, '|', 3)
                || '|' || split_part(notification_key, '|', 5)
        else notification_key
    end
where source_incident_key is null;

update push_notification_events
set source_incident_key = coalesce(source_incident_key, notification_key)
where source_incident_key is null;

update push_line_event_observations
set source_incident_key = coalesce(source_incident_key, notification_key)
where source_incident_key is null;

alter table push_notification_events
    alter column source_incident_key set not null;

alter table push_line_event_observations
    alter column source_incident_key set not null;

create index idx_push_notification_events_source_incident
    on push_notification_events(account_id, source_incident_key, notification_state, created_at desc);

create index idx_push_line_event_observations_source_incident_active
    on push_line_event_observations(account_id, source_incident_key, last_seen_at desc)
    where cleared_at is null;
