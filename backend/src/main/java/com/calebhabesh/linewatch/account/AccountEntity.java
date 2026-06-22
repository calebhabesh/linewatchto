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
    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected AccountEntity() {}

    private AccountEntity(String id, String email, String displayName, String passwordHash, boolean demo, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.demo = demo;
        this.createdAt = createdAt;
        this.lastLoginAt = null;
    }

    public static AccountEntity create(String id, String email, String displayName, String passwordHash, boolean demo, Instant createdAt) {
        return new AccountEntity(id, email, displayName, passwordHash, demo, createdAt);
    }

    public static AccountEntity createPasswordless(String id, String email, String displayName, boolean demo, Instant createdAt) {
        return new AccountEntity(id, email, displayName, null, demo, createdAt);
    }

    public void markLogin(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public void replacePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public boolean isDemo() { return demo; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastLoginAt() { return lastLoginAt; }
}
