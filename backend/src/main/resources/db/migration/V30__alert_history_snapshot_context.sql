alter table snapshots
    add column source_id varchar(120),
    add column line_id varchar(32) references transit_lines(id),
    add column title varchar(500),
    add column event_type varchar(48),
    add column source_alert_type varchar(32),
    add column impact_kind varchar(40),
    add column start_station_id varchar(80) references stations(id),
    add column end_station_id varchar(80) references stations(id),
    add column direction varchar(160),
    add column cause varchar(80),
    add column cause_description varchar(160);

update snapshots s
set source_id = a.source_id,
    line_id = a.line_id,
    title = a.title,
    event_type =
        case
            when a.impact_kind = 'suspension' then 'suspension'
            when a.impact_kind = 'delay' then 'delay'
            when a.impact_kind = 'reduced-speed-zone' then 'reduced-speed-zone'
            when a.impact_kind = 'planned-closure' then 'planned-closure'
            else 'service-alert'
        end,
    source_alert_type = a.source_alert_type,
    impact_kind = a.impact_kind,
    start_station_id = a.start_station_id,
    end_station_id = a.end_station_id,
    direction = a.direction,
    cause = a.cause,
    cause_description = a.cause_description
from alerts a
where a.id = s.alert_id;

create index idx_snapshots_time_id
    on snapshots(snapshot_time desc, id desc);

create index idx_snapshots_alert_time
    on snapshots(alert_id, snapshot_time desc, id desc);

create index idx_snapshots_line_time
    on snapshots(line_id, snapshot_time desc);
