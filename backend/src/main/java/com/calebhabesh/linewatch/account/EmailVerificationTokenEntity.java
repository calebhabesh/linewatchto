package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "email_verification_tokens")
public class EmailVerificationTokenEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    @Column(name = "token_hash")
    private String tokenHash;
    @Column(name = "requested_at")
    private Instant requestedAt;
    @Column(name = "expires_at")
    private Instant expiresAt;
    @Column(name = "used_at")
    private Instant usedAt;

    protected EmailVerificationTokenEntity() {}

    private EmailVerificationTokenEntity(
        String id,
        AccountEntity account,
        String tokenHash,
        Instant requestedAt,
        Instant expiresAt
    ) {
        this.id = id;
        this.account = account;
        this.tokenHash = tokenHash;
        this.requestedAt = requestedAt;
        this.expiresAt = expiresAt;
        this.usedAt = null;
    }

    public static EmailVerificationTokenEntity create(
        String id,
        AccountEntity account,
        String tokenHash,
        Instant requestedAt,
        Instant expiresAt
    ) {
        return new EmailVerificationTokenEntity(id, account, tokenHash, requestedAt, expiresAt);
    }

    public void markUsed(Instant usedAt) {
        this.usedAt = usedAt;
    }

    public boolean isUsableAt(Instant now) {
        return usedAt == null && expiresAt.isAfter(now);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getTokenHash() { return tokenHash; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getUsedAt() { return usedAt; }
}
