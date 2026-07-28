alter table saved_commutes
    drop constraint if exists saved_commutes_origin_station_id_fkey,
    drop constraint if exists saved_commutes_destination_station_id_fkey,
    drop constraint if exists saved_commutes_account_id_origin_station_id_destination_station_id_key;

alter table saved_commutes
    add column network_id varchar(24) not null default 'ttc';

alter table saved_commutes
    add constraint saved_commutes_network_check check (network_id in ('ttc', 'regional')),
    add constraint saved_commutes_account_network_route_key
        unique (account_id, network_id, origin_station_id, destination_station_id);

create index idx_saved_commutes_account_network
    on saved_commutes(account_id, network_id, created_at);

