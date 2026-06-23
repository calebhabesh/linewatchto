package com.calebhabesh.linewatch.account;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class GoogleJwtIdentityVerifier implements GoogleIdentityVerifier {
    private static final Set<String> GOOGLE_ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");
    private static final int MAX_CREDENTIAL_LENGTH = 8192;

    private final GoogleAuthProperties properties;
    private final JwtDecoder decoder;

    @Autowired
    public GoogleJwtIdentityVerifier(GoogleAuthProperties properties) {
        this(properties, properties.idTokenVerificationConfigured() ? NimbusJwtDecoder.withJwkSetUri(properties.getJwkSetUri()).build() : null);
    }

    GoogleJwtIdentityVerifier(GoogleAuthProperties properties, JwtDecoder decoder) {
        this.properties = properties;
        this.decoder = decoder;
    }

    @Override
    public VerifiedGoogleIdentity verify(String credential) {
        if (!properties.idTokenVerificationConfigured()) {
            throw new AccountException(HttpStatus.SERVICE_UNAVAILABLE, "google_auth_unavailable", "Google sign-in is not configured.");
        }

        String token = credential == null ? "" : credential.trim();
        if (token.isBlank() || token.length() > MAX_CREDENTIAL_LENGTH) {
            throw invalidCredential();
        }

        if (decoder == null) {
            throw new AccountException(HttpStatus.SERVICE_UNAVAILABLE, "google_auth_unavailable", "Google sign-in is not configured.");
        }

        Jwt jwt;
        try {
            jwt = decoder.decode(token);
        } catch (JwtException ex) {
            throw invalidCredential();
        }

        String issuer = "";
        try {
            issuer = jwt.getIssuer() == null ? "" : jwt.getIssuer().toString();
        } catch (Exception ex) {
            Object issClaim = jwt.getClaim("iss");
            issuer = issClaim == null ? "" : issClaim.toString();
        }
        if (!GOOGLE_ISSUERS.contains(issuer)) {
            throw invalidCredential();
        }

        if (!audienceContainsClientId(jwt.getAudience())) {
            throw invalidCredential();
        }

        String subject = jwt.getSubject();
        String email = jwt.getClaimAsString("email");
        Boolean emailVerified = jwt.getClaim("email_verified");
        String displayName = jwt.getClaimAsString("name");

        if (blank(subject) || blank(email)) {
            throw invalidCredential();
        }
        if (!Boolean.TRUE.equals(emailVerified)) {
            throw new AccountException(HttpStatus.UNAUTHORIZED, "google_email_unverified", "Google account email must be verified.");
        }

        return new VerifiedGoogleIdentity(subject, email, true, displayName == null ? "" : displayName.trim());
    }

    private boolean audienceContainsClientId(Collection<String> audiences) {
        if (audiences == null || audiences.isEmpty()) {
            return false;
        }
        String clientId = properties.getClientId();
        return audiences.stream().anyMatch(candidate -> candidate.equals(clientId));
    }

    private AccountException invalidCredential() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "invalid_google_credential", "Could not verify Google sign-in.");
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
