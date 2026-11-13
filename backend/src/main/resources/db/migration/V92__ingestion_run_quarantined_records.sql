-- Provider records a successful TTC alert run set aside because normalizing or writing them
-- failed. The count feeds health and metrics; the detail (kind, source ID, cause) stays
-- server-side because a cause can quote the raw provider payload.
alter table ingestion_runs
    add column records_quarantined integer not null default 0,
    add column quarantined_records text;
