package com.calebhabesh.linewatch.account;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class GoogleOAuthService {
    public static final String MODE_LOGIN = "login";
    public static final String MODE_LINK = "link";
    private static final Duration STATE_TTL = Duration.ofMinutes(10);
    private static final int MAX_RETURN_TO_LENGTH = 512;

    private final GoogleAuthProperties properties;
    private final SessionTokenService tokenService;
    private final GoogleOAuthTokenClient tokenClient;
    private final GoogleIdentityVerifier identityVerifier;

    public GoogleOAuthService(
        GoogleAuthProperties properties,
        SessionTokenService tokenService,
        GoogleOAuthTokenClient tokenClient,
        GoogleIdentityVerifier identityVerifier
    ) {
        this.properties = properties;
        this.tokenService = tokenService;
        this.tokenClient = tokenClient;
        this.identityVerifier = identityVerifier;
    }

    public GoogleOAuthStart start(String mode, String returnTo) {
        if (!properties.oauthConfigured()) {
            throw new AccountException(HttpStatus.SERVICE_UNAVAILABLE, "google_auth_unavailable", "Google sign-in is not configured.");
        }

        GoogleOAuthState state = new GoogleOAuthState(
            tokenService.generateToken().rawToken(),
            normalizeMode(mode),
            normalizeReturnTo(returnTo)
        );
        URI authorizationUri = UriComponentsBuilder.fromUriString(properties.getAuthorizationUri())
            .queryParam("client_id", properties.getClientId())
            .queryParam("redirect_uri", properties.getRedirectUri())
            .queryParam("response_type", "code")
            .queryParam("scope", "openid email profile")
            .queryParam("state", state.state())
            .queryParam("prompt", "select_account")
            .build()
            .encode()
            .toUri();
        return new GoogleOAuthStart(authorizationUri, encodeStateCookie(state));
    }

    public VerifiedGoogleOAuthCallback verifyCallback(String stateCookie, String state, String code, String error) {
        if (error != null && !error.isBlank()) {
            throw oauthFailed();
        }

        GoogleOAuthState storedState = decodeStateCookie(stateCookie).orElseThrow(this::oauthFailed);
        String callbackState = state == null ? "" : state.trim();
        if (!storedState.state().equals(callbackState)) {
            throw oauthFailed();
        }

        String idToken = tokenClient.exchangeCodeForIdToken(code);
        VerifiedGoogleIdentity identity = identityVerifier.verify(idToken);
        return new VerifiedGoogleOAuthCallback(storedState.mode(), storedState.returnTo(), identity);
    }

    public Duration stateTtl() {
        return STATE_TTL;
    }

    Optional<GoogleOAuthState> decodeStateCookie(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\.", 3);
            if (parts.length != 3) {
                return Optional.empty();
            }
            String state = parts[0];
            String mode = normalizeMode(parts[1]);
            String returnTo = new String(Base64.getUrlDecoder().decode(parts[2]), StandardCharsets.UTF_8);
            if (state.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(new GoogleOAuthState(state, mode, normalizeReturnTo(returnTo)));
        } catch (RuntimeException ex) {
            return Optional.empty();
        }
    }

    private String encodeStateCookie(GoogleOAuthState state) {
        String encodedReturnTo = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(state.returnTo().getBytes(StandardCharsets.UTF_8));
        String payload = state.state() + "." + state.mode() + "." + encodedReturnTo;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    private String normalizeMode(String mode) {
        String normalized = mode == null ? MODE_LOGIN : mode.trim().toLowerCase();
        if (MODE_LOGIN.equals(normalized) || MODE_LINK.equals(normalized)) {
            return normalized;
        }
        throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_google_oauth_mode", "Google sign-in mode is invalid.");
    }

    private String normalizeReturnTo(String returnTo) {
        String normalized = returnTo == null ? "/" : returnTo.trim();
        if (
            normalized.isBlank() ||
                normalized.length() > MAX_RETURN_TO_LENGTH ||
                !normalized.startsWith("/") ||
                normalized.startsWith("//") ||
                normalized.contains("\\") ||
                normalized.contains("\n") ||
                normalized.contains("\r")
        ) {
            return "/";
        }
        return normalized;
    }

    private AccountException oauthFailed() {
        return new AccountException(HttpStatus.BAD_REQUEST, "google_oauth_failed", "Could not complete Google sign-in.");
    }

    public record GoogleOAuthStart(URI authorizationUri, String cookieValue) {}
    record GoogleOAuthState(String state, String mode, String returnTo) {}
    public record VerifiedGoogleOAuthCallback(String mode, String returnTo, VerifiedGoogleIdentity identity) {}
}
