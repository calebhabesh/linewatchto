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
@Table(name = "account_auth_identities")
public class AccountAuthIdentityEntity {
    public static final String PROVIDER_GOOGLE = "google";

    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    private String provider;
    @Column(name = "provider_subject")
    private String providerSubject;
    private String email;
    @Column(name = "email_verified")
    private boolean emailVerified;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected AccountAuthIdentityEntity() {}

    private AccountAuthIdentityEntity(
        String id,
        AccountEntity account,
        String provider,
        String providerSubject,
        String email,
        boolean emailVerified,
        Instant createdAt
    ) {
        this.id = id;
        this.account = account;
        this.provider = provider;
        this.providerSubject = providerSubject;
        this.email = email;
        this.emailVerified = emailVerified;
        this.createdAt = createdAt;
        this.lastLoginAt = null;
    }

    public static AccountAuthIdentityEntity createGoogle(
        String id,
        AccountEntity account,
        String providerSubject,
        String email,
        boolean emailVerified,
        Instant createdAt
    ) {
        return new AccountAuthIdentityEntity(
            id,
            account,
            PROVIDER_GOOGLE,
            providerSubject,
            email,
            emailVerified,
            createdAt
        );
    }

    public void updateGoogleProfile(String email, boolean emailVerified, Instant lastLoginAt) {
        this.email = email;
        this.emailVerified = emailVerified;
        this.lastLoginAt = lastLoginAt;
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getProvider() { return provider; }
    public String getProviderSubject() { return providerSubject; }
    public String getEmail() { return email; }
    public boolean isEmailVerified() { return emailVerified; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastLoginAt() { return lastLoginAt; }
}
