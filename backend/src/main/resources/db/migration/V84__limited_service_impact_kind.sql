alter table alerts drop constraint chk_alerts_impact_kind;

alter table alerts add constraint chk_alerts_impact_kind
    check (impact_kind in (
        'suspension',
        'delay',
        'reduced-speed-zone',
        'planned-closure',
        'limited-service'
    ));
