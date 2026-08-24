alter table ttc_alert_source_records
  drop constraint if exists ttc_alert_source_records_source_section_check;

alter table ttc_alert_source_records
  add constraint ttc_alert_source_records_source_section_check
  check (source_section in (
    'routes',
    'accessibility',
    'site-wide-announcements',
    'general-announcements',
    'subway-closures'
  ));

alter table ingestion_runs
  add column ttc_subway_closure_supplement_available boolean not null default false,
  add column ttc_subway_closure_records_fetched integer not null default 0;
