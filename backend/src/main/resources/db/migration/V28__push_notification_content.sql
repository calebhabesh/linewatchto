alter table push_notification_events
    add column notification_subject varchar(120);

alter table push_notification_events
    add column event_location text;

alter table push_notification_events
    add column scope_label varchar(180);

alter table push_notification_events
    add column source_event_at timestamp with time zone;

alter table push_notification_events
    alter column body type text;

update push_notification_events
set notification_subject =
    case
        when line_id in ('line-1', 'line-2', 'line-4', 'line-5', 'line-6') then
            case line_id
                when 'line-1' then 'Line 1 Yonge-University'
                when 'line-2' then 'Line 2 Bloor-Danforth'
                when 'line-4' then 'Line 4 Sheppard'
                when 'line-5' then 'Line 5 Eglinton'
                when 'line-6' then 'Line 6 Finch West'
            end
            || ' '
            || case event_type
                when 'suspension' then 'Suspension'
                when 'delay' then 'Delay'
                when 'reduced-speed-zone' then 'Reduced Speed Zone'
                when 'planned-closure' then 'Planned Closure'
                else 'Service Alert'
            end
        else 'TTC Service Alert'
    end
where notification_subject is null;

alter table push_notification_events
    alter column notification_subject set not null;
