create table accounts (
    id varchar(80) primary key,
    email varchar(320) not null unique,
    display_name varchar(120) not null,
    password_hash varchar(255) not null,
    demo boolean not null default false,
    created_at timestamp with time zone not null,
    last_login_at timestamp with time zone
);

create table user_sessions (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    token_hash varchar(64) not null unique,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null
);

create table saved_commutes (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    label varchar(120) not null,
    origin_station_id varchar(80) not null references stations(id),
    destination_station_id varchar(80) not null references stations(id),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    unique (account_id, origin_station_id, destination_station_id),
    check (origin_station_id <> destination_station_id)
);

create index idx_user_sessions_account_id
    on user_sessions(account_id);

create index idx_user_sessions_expires_at
    on user_sessions(expires_at);

create index idx_saved_commutes_account_id
    on saved_commutes(account_id, created_at);
