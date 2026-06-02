alter table alerts
    add column impact_kind varchar(32),
    add column rsz_length varchar(80),
    add column station_distance varchar(80),
    add column track_percent varchar(80),
    add column reduced_speed varchar(80),
    add column average_speed varchar(80);

update alerts
set impact_kind = case
    when type = 'planned-closure' then 'planned-closure'
    when severity = 'suspension' then 'suspension'
    when lower(coalesce(effect_description, '')) = 'reduced speed zone'
        then 'reduced-speed-zone'
    else 'delay'
end
where impact_kind is null;

alter table alerts
    alter column impact_kind set not null,
    add constraint chk_alerts_impact_kind
        check (impact_kind in (
            'suspension',
            'delay',
            'reduced-speed-zone',
            'planned-closure'
        ));
