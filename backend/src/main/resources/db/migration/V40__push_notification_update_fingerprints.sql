alter table push_line_event_observations
    add column update_fingerprint varchar(64);

alter table push_saved_commute_event_observations
    add column update_fingerprint varchar(64);
