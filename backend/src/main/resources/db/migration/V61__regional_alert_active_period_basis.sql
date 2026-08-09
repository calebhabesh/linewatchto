alter table regional_alerts
    add column active_period_basis varchar(32) not null default 'source-active-period';
