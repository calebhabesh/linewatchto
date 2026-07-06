alter table saved_commutes
    add column notification_enabled boolean not null default true,
    add column notification_day_mask smallint not null default 127,
    add column notification_start_minute integer,
    add column notification_end_minute integer,
    add column notification_section_start_station_id varchar(80),
    add column notification_section_end_station_id varchar(80),
    add column notification_outbound_enabled boolean not null default true,
    add column notification_return_enabled boolean not null default true,
    add column notification_suspension_enabled boolean not null default true,
    add column notification_delay_enabled boolean not null default true,
    add column notification_reduced_speed_zone_enabled boolean not null default true,
    add column notification_planned_closure_enabled boolean not null default true,
    add column notification_restored_enabled boolean not null default true;

alter table saved_commutes
    add constraint chk_saved_commutes_notification_day_mask
        check (notification_day_mask between 0 and 127),
    add constraint chk_saved_commutes_notification_start_minute
        check (notification_start_minute is null or notification_start_minute between 0 and 1439),
    add constraint chk_saved_commutes_notification_end_minute
        check (notification_end_minute is null or notification_end_minute between 0 and 1439),
    add constraint chk_saved_commutes_notification_time_pair
        check (
            (notification_start_minute is null and notification_end_minute is null)
            or (notification_start_minute is not null and notification_end_minute is not null and notification_start_minute <> notification_end_minute)
        );

create index idx_saved_commutes_notification_enabled
    on saved_commutes(account_id, notification_enabled, notification_day_mask);
