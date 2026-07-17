package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class VapidWebPushClientSpringContextTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(PushConfiguration.class, VapidWebPushClient.class);

    @Test
    void createsWebPushClientBeanWithConfiguredPushProperties() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(PushProperties.class);
            assertThat(context).hasSingleBean(WebPushClient.class);
        });
    }

    @Test
    @SuppressWarnings("unchecked")
    void sendsTopicHeaderWithWebPushRequest() throws Exception {
        PushProperties properties = new PushProperties();
        properties.setVapidPublicKey("BPublicVapidKey");
        properties.setVapidPrivateKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE");
        properties.setVapidSubject("mailto:test@example.com");
        HttpClient httpClient = mock(HttpClient.class);
        HttpResponse<Void> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(201);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        VapidWebPushClient client = new VapidWebPushClient(
            properties,
            Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC),
            httpClient
        );
        AccountEntity account = AccountEntity.create(
            "user_1",
            "rider@example.com",
            "Rider",
            "$2a$hash",
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://updates.push.services.mozilla.com/wpush/v2/subscription",
            "endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Firefox",
            Instant.parse("2026-06-05T14:45:00Z")
        );

        PushDeliveryResult result = client.send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3", null);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertThat(result.status()).isEqualTo("accepted");
        assertThat(request.headers().firstValue("Topic")).contains("AVEPD-AuDIedMxfArNYRpmed5ppkzhC3");
        assertThat(request.headers().firstValue("TTL")).contains("3600");
        assertThat(request.headers().firstValue("Urgency")).contains("high");
    }
}
