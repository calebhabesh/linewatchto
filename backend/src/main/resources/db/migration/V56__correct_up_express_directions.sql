update regional_gtfs_departures
set direction = case direction
    when 'Union Station' then 'Pearson Airport'
    when 'Pearson Airport' then 'Union Station'
end
where line_id = 'regional-up'
  and direction in ('Union Station', 'Pearson Airport');
