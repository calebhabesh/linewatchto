alter table line_segments
    alter column svg_path drop not null,
    add column forward_direction varchar(16),
    add column guide_path_id varchar(160),
    add column guide_path_reversed boolean not null default false,
    add column station_a_anchor_id varchar(160),
    add column station_b_anchor_id varchar(160);

alter table line_segments
    drop constraint if exists line_segments_station_a_id_station_b_id_key,
    add constraint uq_line_segments_line_stations
        unique (line_id, station_a_id, station_b_id);

delete from alert_segments;
delete from line_segments;

with topology_paths(line_id, first_sort_order, forward_direction, station_ids) as (
    values
    (
        'line-1', 100, 'southbound', array[
            'vaughan-metropolitan-centre', 'highway-407', 'pioneer-village',
            'york-university', 'finch-west', 'downsview-park', 'sheppard-west',
            'wilson', 'yorkdale', 'lawrence-west', 'glencairn', 'cedarvale',
            'st-clair-west', 'dupont', 'spadina', 'st-george', 'museum',
            'queens-park', 'st-patrick', 'osgoode', 'st-andrew', 'union'
        ]::varchar[]
    ),
    (
        'line-1', 200, 'southbound', array[
            'finch', 'north-york-centre', 'sheppard-yonge', 'york-mills',
            'lawrence', 'eglinton', 'davisville', 'st-clair', 'summerhill',
            'rosedale', 'bloor-yonge', 'wellesley', 'college', 'tmu', 'queen',
            'king', 'union'
        ]::varchar[]
    ),
    (
        'line-2', 300, 'eastbound', array[
            'kipling', 'islington', 'royal-york', 'old-mill', 'jane',
            'runnymede', 'high-park', 'keele', 'dundas-west', 'lansdowne',
            'dufferin', 'ossington', 'christie', 'bathurst', 'spadina',
            'st-george', 'bay', 'bloor-yonge', 'sherbourne', 'castle-frank',
            'broadview', 'chester', 'pape', 'donlands', 'greenwoood', 'coxwell',
            'woodbine', 'main-street', 'victoria-park', 'warden', 'kennedy'
        ]::varchar[]
    ),
    (
        'line-4', 400, 'eastbound', array[
            'sheppard-yonge', 'bayview', 'bessarion', 'leslie', 'don-mills'
        ]::varchar[]
    ),
    (
        'line-5', 500, 'eastbound', array[
            'mount-dennis', 'keelesdale', 'caledonia', 'fairbank', 'oakwood',
            'cedarvale', 'forest-hill', 'chaplin', 'avenue', 'eglinton',
            'mount-pleasant', 'leaside', 'laird', 'sunnybrook-park',
            'don-valley', 'aga-khan-park-and-museum', 'wynford', 'sloane',
            'o_connor', 'pharmacy', 'hakimi-lebovic', 'golden-mile',
            'birchmount', 'ionview', 'kennedy'
        ]::varchar[]
    ),
    (
        'line-6', 600, 'eastbound', array[
            'humber-college', 'westmore', 'martin-grove', 'albion', 'stevenson',
            'mount-olive', 'rowntree-mills', 'pearldale', 'duncanwoods',
            'milvan-rumike', 'emery', 'signet-arrow', 'norfinch-oakdale',
            'jane-and-finch', 'driftwood', 'tobermory', 'sentinel', 'finch-west'
        ]::varchar[]
    )
)
insert into line_segments (
    id, line_id, station_a_id, station_b_id, geom, svg_path, sort_order,
    forward_direction
)
select
    format('%s-%s-%s', line_id, station_ids[index], station_ids[index + 1]),
    line_id,
    station_ids[index],
    station_ids[index + 1],
    null,
    null,
    first_sort_order + index,
    forward_direction
from topology_paths
cross join lateral generate_subscripts(station_ids, 1) as station_index(index)
where index < array_length(station_ids, 1);

update line_segments
set guide_path_id = 'seg-line-1-dupont-spadina',
    guide_path_reversed = true,
    station_b_anchor_id = 'station-spadina-1'
where id = 'line-1-dupont-spadina';

update line_segments
set guide_path_id = 'seg-line-1-spadina-st-george',
    guide_path_reversed = true,
    station_a_anchor_id = 'station-spadina-1'
where id = 'line-1-spadina-st-george';

update line_segments
set guide_path_id = 'seg-line-1-st-andrew-union'
where id = 'line-1-st-andrew-union';

update line_segments
set guide_path_id = 'seg-line-1-union-king'
where id = 'line-1-king-union';

update line_segments
set station_b_anchor_id = 'station-spadina-2'
where id = 'line-2-bathurst-spadina';

update line_segments
set station_a_anchor_id = 'station-spadina-2'
where id = 'line-2-spadina-st-george';

alter table line_segments
    alter column forward_direction set not null,
    add constraint chk_line_segments_forward_direction
        check (forward_direction in ('northbound', 'southbound', 'eastbound', 'westbound'));

create index idx_line_segments_line_id_sort_order
    on line_segments(line_id, sort_order);
