create table saved_stations (
    account_id varchar(80) not null references accounts(id) on delete cascade,
    station_id varchar(80) not null references stations(id) on delete cascade,
    created_at timestamp with time zone not null,
    primary key (account_id, station_id)
);

create index idx_saved_stations_account_created
    on saved_stations(account_id, created_at desc);
