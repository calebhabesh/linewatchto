alter table saved_stations
    drop constraint saved_stations_station_id_fkey;

alter table saved_stations
    drop constraint saved_stations_pkey;

alter table saved_stations
    add column network_id varchar(20) not null default 'ttc';

alter table saved_stations
    add constraint chk_saved_stations_network
        check (network_id in ('ttc', 'regional'));

alter table saved_stations
    add primary key (account_id, network_id, station_id);

drop index idx_saved_stations_account_created;

create index idx_saved_stations_account_created
    on saved_stations(account_id, network_id, created_at desc);
