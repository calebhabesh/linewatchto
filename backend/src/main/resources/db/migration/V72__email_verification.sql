alter table accounts
    add column email_verified_at timestamp with time zone;

-- Accounts created before email verification shipped are grandfathered so the
-- rollout does not invalidate existing sessions or lock existing riders out.
update accounts
set email_verified_at = created_at
where email_verified_at is null;

create table email_verification_tokens (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    token_hash varchar(64) not null unique,
    requested_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone
);

create index idx_email_verification_tokens_account_id
    on email_verification_tokens(account_id);

create index idx_email_verification_tokens_expires_at
    on email_verification_tokens(expires_at);
