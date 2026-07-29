create table regional_alert_snapshots (
    id bigserial primary key,
    alert_id varchar(180) not null,
    line_id varchar(80) not null,
    impact_kind varchar(40) not null,
    title text not null,
    station_ids jsonb not null default '[]'::jsonb,
    active boolean not null,
    snapshot_time timestamp with time zone not null default now()
);

create index idx_regional_alert_snapshots_line_time
    on regional_alert_snapshots (line_id, snapshot_time desc);

create index idx_regional_alert_snapshots_alert_time
    on regional_alert_snapshots (alert_id, snapshot_time, id);

insert into regional_alert_snapshots (
    alert_id, line_id, impact_kind, title, station_ids, active, snapshot_time
)
select id, line_id, impact_kind, title, station_ids, active, updated_at
from regional_alerts;
