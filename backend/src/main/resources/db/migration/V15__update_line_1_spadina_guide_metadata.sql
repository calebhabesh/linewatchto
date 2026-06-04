update line_segments
set guide_path_id = null,
    guide_path_reversed = false,
    station_b_anchor_id = 'station-spadina-1'
where id = 'line-1-dupont-spadina';

update line_segments
set guide_path_id = 'seg-line-1-st-george-spadina',
    guide_path_reversed = true,
    station_a_anchor_id = 'station-spadina-1'
where id = 'line-1-spadina-st-george';
