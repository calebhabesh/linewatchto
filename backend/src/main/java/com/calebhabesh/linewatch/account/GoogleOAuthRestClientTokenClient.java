package com.calebhabesh.linewatch.account;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class GoogleOAuthRestClientTokenClient implements GoogleOAuthTokenClient {
    private static final String GRANT_TYPE_AUTHORIZATION_CODE = "authorization_code";
    private static final int MAX_CODE_LENGTH = 2048;

    private final GoogleAuthProperties properties;
    private final RestClient restClient;

    @Autowired
    public GoogleOAuthRestClientTokenClient(GoogleAuthProperties properties, RestClient.Builder restClientBuilder) {
        this(properties, restClientBuilder.build());
    }

    GoogleOAuthRestClientTokenClient(GoogleAuthProperties properties, RestClient restClient) {
        this.properties = properties;
        this.restClient = restClient;
    }

    @Override
    public String exchangeCodeForIdToken(String code) {
        if (!properties.oauthConfigured()) {
            throw unavailable();
        }

        String trimmedCode = code == null ? "" : code.trim();
        if (trimmedCode.isBlank() || trimmedCode.length() > MAX_CODE_LENGTH) {
            throw invalid();
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", trimmedCode);
        form.add("client_id", properties.getClientId());
        form.add("client_secret", properties.getClientSecret());
        form.add("redirect_uri", properties.getRedirectUri());
        form.add("grant_type", GRANT_TYPE_AUTHORIZATION_CODE);

        GoogleOAuthTokenResponse response;
        try {
            response = restClient.post()
                .uri(properties.getTokenUri())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(GoogleOAuthTokenResponse.class);
        } catch (RestClientException ex) {
            throw invalid();
        }

        if (response == null || response.idToken() == null || response.idToken().isBlank()) {
            throw invalid();
        }
        return response.idToken();
    }

    private AccountException unavailable() {
        return new AccountException(HttpStatus.SERVICE_UNAVAILABLE, "google_auth_unavailable", "Google sign-in is not configured.");
    }

    private AccountException invalid() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "invalid_google_credential", "Could not verify Google sign-in.");
    }

    record GoogleOAuthTokenResponse(@JsonProperty("id_token") String idToken) {}
}
