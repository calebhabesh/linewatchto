alter table alerts
    add column missing_poll_count integer not null default 0;

alter table alerts
    add constraint chk_alerts_missing_poll_count
    check (missing_poll_count >= 0);
