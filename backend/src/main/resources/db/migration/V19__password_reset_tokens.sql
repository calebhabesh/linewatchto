create table password_reset_tokens (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    token_hash varchar(64) not null unique,
    requested_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone
);

create index idx_password_reset_tokens_account_id
    on password_reset_tokens(account_id);

create index idx_password_reset_tokens_expires_at
    on password_reset_tokens(expires_at);
