package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponentsBuilder;

class GoogleOAuthServiceTest {
    private final GoogleAuthProperties properties = googleProperties();
    private final SessionTokenService tokenService = new SessionTokenService();
    private final GoogleOAuthTokenClient tokenClient = mock(GoogleOAuthTokenClient.class);
    private final GoogleIdentityVerifier identityVerifier = mock(GoogleIdentityVerifier.class);
    private final GoogleOAuthService service = new GoogleOAuthService(properties, tokenService, tokenClient, identityVerifier);

    @Test
    void startBuildsGoogleAuthorizationUrlAndStateCookie() {
        GoogleOAuthService.GoogleOAuthStart start = service.start("login", "/?panel=commutes");
        MultiValueMap<String, String> query = UriComponentsBuilder.fromUri(start.authorizationUri()).build().getQueryParams();

        assertThat(start.authorizationUri().toString()).startsWith("https://accounts.google.com/o/oauth2/v2/auth?");
        assertThat(query.getFirst("client_id")).isEqualTo("client-123.apps.googleusercontent.com");
        assertThat(query.getFirst("redirect_uri")).isEqualTo("http://localhost:3000/api/auth/google/callback");
        assertThat(query.getFirst("response_type")).isEqualTo("code");
        assertThat(URLDecoder.decode(query.getFirst("scope"), StandardCharsets.UTF_8)).isEqualTo("openid email profile");
        assertThat(query.getFirst("prompt")).isEqualTo("select_account");
        assertThat(query.getFirst("state")).isNotBlank();

        GoogleOAuthService.GoogleOAuthState state = service.decodeStateCookie(start.cookieValue()).orElseThrow();
        assertThat(state.state()).isEqualTo(query.getFirst("state"));
        assertThat(state.mode()).isEqualTo("login");
        assertThat(state.returnTo()).isEqualTo("/?panel=commutes");
    }

    @Test
    void callbackExchangesCodeAndVerifiesReturnedIdToken() {
        GoogleOAuthService.GoogleOAuthStart start = service.start("link", "/");
        String state = UriComponentsBuilder.fromUri(start.authorizationUri()).build().getQueryParams().getFirst("state");
        VerifiedGoogleIdentity identity = new VerifiedGoogleIdentity("google-subject", "rider@example.com", true, "Transit Rider");
        when(tokenClient.exchangeCodeForIdToken("code-123")).thenReturn("id-token");
        when(identityVerifier.verify("id-token")).thenReturn(identity);

        GoogleOAuthService.VerifiedGoogleOAuthCallback callback = service.verifyCallback(
            start.cookieValue(),
            state,
            "code-123",
            null
        );

        assertThat(callback.mode()).isEqualTo("link");
        assertThat(callback.returnTo()).isEqualTo("/");
        assertThat(callback.identity()).isEqualTo(identity);
        verify(tokenClient).exchangeCodeForIdToken("code-123");
        verify(identityVerifier).verify("id-token");
    }

    @Test
    void callbackRejectsMismatchedState() {
        GoogleOAuthService.GoogleOAuthStart start = service.start("login", "/");

        assertThatThrownBy(() -> service.verifyCallback(start.cookieValue(), "wrong-state", "code-123", null))
            .isInstanceOf(AccountException.class)
            .extracting("status", "error")
            .containsExactly(HttpStatus.BAD_REQUEST, "google_oauth_failed");
    }

    @Test
    void normalizesUnsafeReturnToValuesToRoot() {
        GoogleOAuthService.GoogleOAuthStart start = service.start("login", "https://attacker.example/phish");
        GoogleOAuthService.GoogleOAuthState state = service.decodeStateCookie(start.cookieValue()).orElseThrow();

        assertThat(state.returnTo()).isEqualTo("/");
    }

    @Test
    void rejectsAuthorityBearingBackslashReturnTo() {
        GoogleOAuthService.GoogleOAuthStart start = service.start("login", "/\\attacker.example/phish");
        GoogleOAuthService.GoogleOAuthState state = service.decodeStateCookie(start.cookieValue()).orElseThrow();

        assertThat(state.returnTo()).isEqualTo("/");
    }

    private static GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        result.setClientSecret("client-secret");
        result.setRedirectUri("http://localhost:3000/api/auth/google/callback");
        return result;
    }
}
