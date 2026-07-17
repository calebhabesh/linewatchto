update stations
set name = case id
    when 'greenwoood' then 'Greenwood'
    when 'queens-park' then 'Queen''s Park'
    when 'st-patrick' then 'St Patrick'
    when 'st-andrew' then 'St Andrew'
    when 'st-clair' then 'St Clair'
    when 'st-clair-west' then 'St Clair West'
end
where id in (
    'greenwoood',
    'queens-park',
    'st-patrick',
    'st-andrew',
    'st-clair',
    'st-clair-west'
);
