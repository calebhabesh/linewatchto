-- Align Cedarvale visual coordinates to match visual center of the SVG station dot
update stations
set map_y = 1810
where id = 'cedarvale';
