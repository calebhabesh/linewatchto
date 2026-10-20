-- Provider-authored text has no published length limit. A single over-long value
-- previously aborted every TTC alert poll for hours, so store it as unbounded text.
-- varchar(n) -> text is binary-coercible in PostgreSQL and does not rewrite tables.

alter table alerts
    alter column title type text,
    alter column source_alert_type type text,
    alter column effect type text,
    alter column effect_description type text,
    alter column direction type text,
    alter column cause type text,
    alter column cause_description type text,
    alter column target_removal type text,
    alter column rsz_length type text,
    alter column station_distance type text,
    alter column track_percent type text,
    alter column reduced_speed type text,
    alter column average_speed type text,
    alter column shuttle_type type text,
    alter column shuttle_start type text,
    alter column shuttle_end type text;

alter table snapshots
    alter column title type text,
    alter column source_alert_type type text,
    alter column direction type text,
    alter column cause type text,
    alter column cause_description type text;

alter table accessibility_outages
    alter column title type text,
    alter column effect type text,
    alter column effect_description type text,
    alter column cause type text;

alter table surface_service_notices
    alter column title type text,
    alter column header_text type text,
    alter column url type text,
    alter column effect type text,
    alter column effect_description type text,
    alter column direction type text,
    alter column cause type text,
    alter column cause_description type text;

alter table surface_service_notice_stops
    alter column stop_name type text;

alter table ttc_announcements
    alter column title type text,
    alter column url type text;

alter table regional_alerts
    alter column title type text,
    alter column cause type text;
