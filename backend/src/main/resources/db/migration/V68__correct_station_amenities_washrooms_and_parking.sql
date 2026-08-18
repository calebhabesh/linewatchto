-- Reset washroom and parking flags to default false
update stations set has_washroom = false, has_parking = false;

-- Stations with public washrooms (TTC subway / LRT stations)
update stations set has_washroom = true where id in (
    'bloor-yonge',
    'cedarvale',
    'don-mills',
    'eglinton',
    'finch',
    'finch-west',
    'humber-college',
    'kennedy',
    'kipling',
    'mount-dennis',
    'sheppard-west',
    'sheppard-yonge',
    'vaughan-metropolitan-centre',
    'wilson'
);

-- Stations with commuter parking (TTC commuter parking lots)
update stations set has_parking = true where id in (
    'don-mills',
    'finch',
    'finch-west',
    'highway-407',
    'islington',
    'keele',
    'kipling',
    'leslie',
    'pioneer-village',
    'sheppard-west',
    'warden',
    'wilson',
    'yorkdale'
);
