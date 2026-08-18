alter table stations
    add column has_washroom boolean not null default false,
    add column has_parking boolean not null default false;

-- Stations with public washrooms
update stations set has_washroom = true where id in (
    'vaughan-metropolitan-centre',
    'highway-407',
    'pioneer-village',
    'finch-west',
    'downsview-park',
    'sheppard-west',
    'wilson',
    'spadina',
    'st-george',
    'union',
    'bloor-yonge',
    'eglinton',
    'york-mills',
    'sheppard-yonge',
    'finch',
    'kipling',
    'islington',
    'broadview',
    'warden',
    'kennedy',
    'don-mills'
);

-- Stations with commuter parking
update stations set has_parking = true where id in (
    'highway-407',
    'pioneer-village',
    'finch-west',
    'downsview-park',
    'sheppard-west',
    'wilson',
    'yorkdale',
    'york-mills',
    'finch',
    'kipling',
    'islington',
    'keele',
    'high-park',
    'victoria-park',
    'warden',
    'kennedy',
    'leslie',
    'don-mills'
);
