alter table push_line_event_observations
    alter column update_fingerprint type varchar(255);

alter table push_saved_commute_event_observations
    alter column update_fingerprint type varchar(255);
