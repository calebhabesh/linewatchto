alter table accounts
    alter column password_hash drop not null;

create table account_auth_identities (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    provider varchar(40) not null,
    provider_subject varchar(255) not null,
    email varchar(320) not null,
    email_verified boolean not null default false,
    created_at timestamp with time zone not null,
    last_login_at timestamp with time zone,
    unique (provider, provider_subject),
    unique (account_id, provider)
);

create index idx_account_auth_identities_account_id
    on account_auth_identities(account_id);

create index idx_account_auth_identities_email
    on account_auth_identities(email);
