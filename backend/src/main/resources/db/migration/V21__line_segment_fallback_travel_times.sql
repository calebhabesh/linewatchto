create table line_segment_fallback_travel_times (
    segment_id varchar(120) primary key references line_segments(id) on delete cascade,
    travel_seconds integer not null check (travel_seconds between 30 and 900),
    source varchar(80) not null default 'seeded-fallback'
);

insert into line_segment_fallback_travel_times (segment_id, travel_seconds, source)
select
    id,
    case
        -- Wider subway gaps and terminal approaches.
        when id in (
            'line-1-vaughan-metropolitan-centre-highway-407',
            'line-1-highway-407-pioneer-village',
            'line-1-sheppard-yonge-york-mills',
            'line-1-york-mills-lawrence',
            'line-1-wilson-yorkdale',
            'line-1-yorkdale-lawrence-west',
            'line-2-warden-kennedy'
        ) then 150
        when id in (
            'line-2-kipling-islington',
            'line-2-royal-york-old-mill',
            'line-2-old-mill-jane',
            'line-4-leslie-don-mills'
        ) then 135

        -- Surface-running LRT stretches should not look subway-fast before GTFS is active.
        when id in (
            'line-5-don-valley-aga-khan-park-and-museum',
            'line-5-aga-khan-park-and-museum-wynford',
            'line-5-sloane-o_connor'
        ) then 210
        when id in (
            'line-5-laird-sunnybrook-park',
            'line-5-sunnybrook-park-don-valley',
            'line-5-wynford-sloane',
            'line-5-o_connor-pharmacy',
            'line-5-hakimi-lebovic-golden-mile'
        ) then 185
        when id in (
            'line-6-humber-college-westmore',
            'line-6-martin-grove-albion',
            'line-6-rowntree-mills-pearldale',
            'line-6-milvan-rumike-emery'
        ) then 215
        when id in (
            'line-6-albion-stevenson',
            'line-6-mount-olive-rowntree-mills',
            'line-6-pearldale-duncanwoods',
            'line-6-emery-signet-arrow',
            'line-6-driftwood-tobermory'
        ) then 205

        when line_id = 'line-1' then 115
        when line_id = 'line-2' then 120
        when line_id = 'line-4' then 110
        when line_id = 'line-5' then 170
        when line_id = 'line-6' then 190
        else 120
    end,
    'seeded-fallback'
from line_segments
order by sort_order, id;

create index idx_line_segment_fallback_travel_times_source
    on line_segment_fallback_travel_times(source);
