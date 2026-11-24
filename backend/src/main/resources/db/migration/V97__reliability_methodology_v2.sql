-- Plan 17 A6: methodology v2 columns for disruption classes and station-weighted impact.
-- Episodes gain disruption_class, planned flag, and station_share (0..1).
-- Daily tables gain weighted_impacted_minutes (fractional minutes integrating affected
-- station share over observed service) and store disruption-class groups ('class:*')
-- alongside 'all' and raw impact kinds.
-- reliability_methodology.current_version stays at its current value until a v2 rebuild
-- builds version 2 beside version 1 and switches atomically.

alter table reliability_episodes
    add column disruption_class varchar(32) not null default 'service-alert',
    add column planned boolean not null default false,
    add column station_share double precision not null default 1.0,
    add constraint chk_reliability_episodes_disruption_class
        check (disruption_class in ('service-stopped', 'delay', 'slow-zone', 'service-alert')),
    add constraint chk_reliability_episodes_station_share
        check (station_share >= 0.0 and station_share <= 1.0);

alter table reliability_line_days
    add column weighted_impacted_minutes double precision not null default 0.0,
    add constraint chk_reliability_line_days_weighted
        check (weighted_impacted_minutes >= 0.0);

alter table reliability_station_days
    add column weighted_impacted_minutes double precision not null default 0.0,
    add constraint chk_reliability_station_days_weighted
        check (weighted_impacted_minutes >= 0.0);
