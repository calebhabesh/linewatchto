package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.calebhabesh.linewatch.account.AccountException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class PushEndpointPolicyTest {
    private final PushEndpointPolicy policy = new PushEndpointPolicy();

    @Test
    void acceptsSupportedHttpsWebPushProviders() {
        assertThat(policy.requireAllowed("https://fcm.googleapis.com/fcm/send/subscription"))
            .isEqualTo("https://fcm.googleapis.com/fcm/send/subscription");
        assertThat(policy.requireAllowed("https://webpush.push.apple.com/ios/subscription"))
            .isEqualTo("https://webpush.push.apple.com/ios/subscription");
    }

    @Test
    void rejectsInternalArbitraryAndLookalikeDestinations() {
        assertInvalid("http://127.0.0.1:9090/actuator");
        assertInvalid("https://169.254.169.254/latest/meta-data");
        assertInvalid("https://fcm.googleapis.com.attacker.example/push");
        assertInvalid("https://user@fcm.googleapis.com/push");
        assertInvalid("https://fcm.googleapis.com:8443/push");
    }

    private void assertInvalid(String endpoint) {
        assertThatThrownBy(() -> policy.requireAllowed(endpoint))
            .isInstanceOf(AccountException.class)
            .extracting("status", "error")
            .containsExactly(HttpStatus.BAD_REQUEST, "invalid_push_endpoint");
    }
}
