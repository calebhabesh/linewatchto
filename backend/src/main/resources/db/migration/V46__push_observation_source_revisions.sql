alter table push_line_event_observations
    add column source_updated_at timestamp with time zone;

alter table push_saved_commute_event_observations
    add column source_updated_at timestamp with time zone;
