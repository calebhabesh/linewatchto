package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SessionTokenServiceTest {

    @Test
    void createsOpaqueTokenAndStoresOnlyDeterministicSha256Hash() {
        SessionTokenService service = new SessionTokenService();

        SessionTokenService.GeneratedSessionToken token = service.generateToken();

        assertThat(token.rawToken()).hasSizeGreaterThanOrEqualTo(43);
        assertThat(token.tokenHash()).hasSize(64);
        assertThat(token.tokenHash()).isEqualTo(service.hashToken(token.rawToken()));
        assertThat(token.tokenHash()).isNotEqualTo(token.rawToken());
    }

    @Test
    void tokenHashesAreDeterministicButGeneratedTokensAreUnique() {
        SessionTokenService service = new SessionTokenService();

        assertThat(service.hashToken("same-token")).isEqualTo(service.hashToken("same-token"));
        assertThat(service.generateToken().rawToken()).isNotEqualTo(service.generateToken().rawToken());
    }
}
