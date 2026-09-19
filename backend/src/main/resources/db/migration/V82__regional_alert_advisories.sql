alter table regional_alerts drop constraint if exists regional_alerts_impact_kind_check;
alter table regional_alerts add constraint regional_alerts_impact_kind_check
    check (impact_kind in ('delay', 'suspension', 'planned-closure', 'advisory'));
