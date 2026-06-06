package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordResetLinkFactoryTest {
    @Test
    void buildsResetPasswordRouteFromFrontendBaseUrl() {
        PasswordResetLinkFactory factory = new PasswordResetLinkFactory("https://linewatch.example/");

        String url = factory.resetUrl("reset-token");

        assertThat(url).isEqualTo("https://linewatch.example/reset-password?token=reset-token");
    }

    @Test
    void fallsBackToLocalFrontendWhenBaseUrlIsBlank() {
        PasswordResetLinkFactory factory = new PasswordResetLinkFactory(" ");

        String url = factory.resetUrl("reset-token");

        assertThat(url).isEqualTo("http://localhost:3000/reset-password?token=reset-token");
    }
}
