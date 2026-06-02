delete from station_impacts
where id in (
    'impact-finch-suspension',
    'impact-york-mills-suspension',
    'impact-eglinton-suspension',
    'impact-sherbourne-delay',
    'impact-castle-frank-delay',
    'impact-union-weekend',
    'impact-kipling-weekend'
);
