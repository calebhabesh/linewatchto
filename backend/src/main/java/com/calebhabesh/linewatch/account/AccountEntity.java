package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "accounts")
public class AccountEntity {
    @Id
    private String id;
    private String email;
    @Column(name = "display_name")
    private String displayName;
    @Column(name = "password_hash")
    private String passwordHash;
    private boolean demo;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;
    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected AccountEntity() {}

    private AccountEntity(
        String id,
        String email,
        String displayName,
        String passwordHash,
        boolean demo,
        Instant createdAt,
        Instant emailVerifiedAt
    ) {
        this.id = id;
        this.email = email;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.demo = demo;
        this.createdAt = createdAt;
        this.emailVerifiedAt = emailVerifiedAt;
        this.lastLoginAt = null;
    }

    public static AccountEntity create(String id, String email, String displayName, String passwordHash, boolean demo, Instant createdAt) {
        return new AccountEntity(id, email, displayName, passwordHash, demo, createdAt, createdAt);
    }

    public static AccountEntity createUnverified(
        String id,
        String email,
        String displayName,
        String passwordHash,
        Instant createdAt
    ) {
        return new AccountEntity(id, email, displayName, passwordHash, false, createdAt, null);
    }

    public static AccountEntity createPendingEmailAccount(
        String id,
        String email,
        String displayName,
        Instant createdAt
    ) {
        return new AccountEntity(id, email, displayName, null, false, createdAt, null);
    }

    public static AccountEntity createPasswordless(String id, String email, String displayName, boolean demo, Instant createdAt) {
        return new AccountEntity(id, email, displayName, null, demo, createdAt, createdAt);
    }

    public void markLogin(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public void replacePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void clearPasswordHash() {
        this.passwordHash = null;
    }

    public void updatePendingDisplayName(String displayName) {
        if (!isEmailVerified() && passwordHash == null) {
            this.displayName = displayName;
        }
    }

    public void markEmailVerified(Instant emailVerifiedAt) {
        if (this.emailVerifiedAt == null) {
            this.emailVerifiedAt = emailVerifiedAt;
        }
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public boolean isDemo() { return demo; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getEmailVerifiedAt() { return emailVerifiedAt; }
    public boolean isEmailVerified() { return emailVerifiedAt != null; }
    public Instant getLastLoginAt() { return lastLoginAt; }
}
