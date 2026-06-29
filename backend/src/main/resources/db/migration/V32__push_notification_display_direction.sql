alter table push_notification_events
    add column display_direction varchar(80);

alter table push_line_event_observations
    add column display_direction varchar(80);
