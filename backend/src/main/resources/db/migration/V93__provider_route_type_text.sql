-- route_type is provider text copied as-is (TTC's "routeType" field). A value over 80
-- characters failed the staging write that every TTC record goes through, which would roll
-- back or quarantine the record; nothing joins or indexes on it, so store it unbounded.
alter table ttc_alert_source_records alter column route_type type text;
alter table surface_service_notices alter column route_type type text;
