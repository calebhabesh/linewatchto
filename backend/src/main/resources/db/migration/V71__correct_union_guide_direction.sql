-- The authored Union-to-King curve runs from Union toward King, opposite the
-- line_segments station_a (King) to station_b (Union) topology orientation.
-- Consumers use this flag to keep direction-aware effects and train markers
-- moving along the authored path in the correct direction.
update line_segments
set guide_path_reversed = true
where id = 'line-1-king-union';
