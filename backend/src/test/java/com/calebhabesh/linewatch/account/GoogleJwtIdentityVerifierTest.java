package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class GoogleJwtIdentityVerifierTest {
    private final GoogleAuthProperties properties = googleProperties();
    private final JwtDecoder decoder = mock(JwtDecoder.class);
    private final GoogleJwtIdentityVerifier verifier = new GoogleJwtIdentityVerifier(properties, decoder);

    @Test
    void verifiesGoogleIdentityFromJwtClaims() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "https://accounts.google.com",
            "aud", List.of("client-123.apps.googleusercontent.com"),
            "sub", "google-subject-1",
            "email", "Rider@Example.COM",
            "email_verified", true,
            "name", "Transit Rider"
        )));

        VerifiedGoogleIdentity identity = verifier.verify("credential");

        assertThat(identity.subject()).isEqualTo("google-subject-1");
        assertThat(identity.email()).isEqualTo("Rider@Example.COM");
        assertThat(identity.emailVerified()).isTrue();
        assertThat(identity.displayName()).isEqualTo("Transit Rider");
    }

    @Test
    void rejectsWrongAudience() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "https://accounts.google.com",
            "aud", List.of("other-client"),
            "sub", "google-subject-1",
            "email", "rider@example.com",
            "email_verified", true
        )));

        assertThatThrownBy(() -> verifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in")
            .extracting("status")
            .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void rejectsWrongIssuer() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "https://evil.example",
            "aud", List.of("client-123.apps.googleusercontent.com"),
            "sub", "google-subject-1",
            "email", "rider@example.com",
            "email_verified", true
        )));

        assertThatThrownBy(() -> verifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in");
    }

    @Test
    void rejectsUnverifiedEmail() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "accounts.google.com",
            "aud", List.of("client-123.apps.googleusercontent.com"),
            "sub", "google-subject-1",
            "email", "rider@example.com",
            "email_verified", false
        )));

        assertThatThrownBy(() -> verifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Google account email must be verified");
    }

    @Test
    void rejectsDecoderFailures() {
        when(decoder.decode("bad-credential")).thenThrow(new JwtException("bad jwt"));

        assertThatThrownBy(() -> verifier.verify("bad-credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in");
    }

    @Test
    void rejectsWhenGoogleAuthIsDisabled() {
        GoogleAuthProperties disabled = new GoogleAuthProperties();
        disabled.setEnabled(false);
        disabled.setClientId("client-123.apps.googleusercontent.com");
        GoogleJwtIdentityVerifier disabledVerifier = new GoogleJwtIdentityVerifier(disabled, decoder);

        assertThatThrownBy(() -> disabledVerifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Google sign-in is not configured")
            .extracting("status")
            .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        result.setJwkSetUri("https://www.googleapis.com/oauth2/v3/certs");
        return result;
    }

    private Jwt jwt(Map<String, Object> claims) {
        return new Jwt(
            "token-value",
            Instant.parse("2026-06-22T12:00:00Z"),
            Instant.parse("2026-06-22T13:00:00Z"),
            Map.of("alg", "RS256"),
            claims
        );
    }
}
