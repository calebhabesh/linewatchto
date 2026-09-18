alter table surface_service_notices
  add column alert_class varchar(32) not null default 'service-advisory';

update surface_service_notices
set alert_class = 'service-alert'
where source_id like 'gtfsrt-%'
   or raw_payload ~* '"alertType"[[:space:]]*:[[:space:]]*"Live"';

alter table surface_service_notices
  add constraint chk_ssn_alert_class
  check (alert_class in ('service-alert', 'service-advisory'));
