alter table metrolinx_alert_source_records
    add column canonical_event_id varchar(255),
    add column deterministic_classification jsonb;

create index idx_metrolinx_alert_source_canonical_event
    on metrolinx_alert_source_records (canonical_event_id)
    where canonical_event_id is not null;

alter table regional_alerts
    drop constraint regional_alerts_source_system_source_id_line_id_key;
