package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.math.BigInteger;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.AlgorithmParameters;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.time.Clock;
import java.time.Instant;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class VapidWebPushClientPayloadTest {
    @Test
    @SuppressWarnings("unchecked")
    void sendsEncryptedPayloadWithHighUrgencyForEveryNotificationState() throws Exception {
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
            "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash",
            generateP256dh(),
            base64Url(new byte[] {
                1, 2, 3, 4, 5, 6, 7, 8,
                9, 10, 11, 12, 13, 14, 15, 16
            }),
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        WebPushPayload activePayload = new WebPushPayload(
            "⚠️ Line 1 Yonge-University Delay",
            "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
            "/?panel=commutes&commute=commute_1",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
            "ACTIVE",
            "2026-06-05T15:00:00Z"
        );
        WebPushPayload clearedPayload = new WebPushPayload(
            "✅ Line 1 Yonge-University Delay Cleared",
            "Regular service has resumed.\n🕗 Jun 5, 10:30 AM",
            "/?panel=commutes&commute=commute_1",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
            "CLEARED",
            "2026-06-05T15:10:00Z"
        );

        PushDeliveryResult activeResult = client.send(subscription, "topic-active", activePayload);
        PushDeliveryResult clearedResult = client.send(subscription, "topic-cleared", clearedPayload);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2))
            .send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest activeRequest = requestCaptor.getAllValues().get(0);
        HttpRequest clearedRequest = requestCaptor.getAllValues().get(1);
        assertThat(activeResult.status()).isEqualTo("accepted");
        assertThat(clearedResult.status()).isEqualTo("accepted");
        assertThat(activeRequest.headers().firstValue("Topic")).contains("topic-active");
        assertThat(clearedRequest.headers().firstValue("Topic")).contains("topic-cleared");
        assertThat(activeRequest.headers().firstValue("TTL")).contains("600");
        assertThat(clearedRequest.headers().firstValue("TTL")).contains("86400");
        assertThat(activeRequest.headers().firstValue("Urgency")).contains("high");
        assertThat(clearedRequest.headers().firstValue("Urgency")).contains("high");
        assertThat(activeRequest.headers().firstValue("Content-Encoding")).contains("aes128gcm");
        assertThat(clearedRequest.headers().firstValue("Content-Encoding")).contains("aes128gcm");
        assertThat(activeRequest.bodyPublisher()).isPresent();
        assertThat(clearedRequest.bodyPublisher()).isPresent();
        assertThat(activeRequest.timeout()).contains(Duration.ofSeconds(10));
        assertThat(activeRequest.bodyPublisher().orElseThrow().contentLength()).isGreaterThan(activePayload.toJson().length());
        assertThat(clearedRequest.bodyPublisher().orElseThrow().contentLength()).isGreaterThan(clearedPayload.toJson().length());
    }

    private static String generateP256dh() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();
        ECPublicKey publicKey = (ECPublicKey) pair.getPublic();
        return base64Url(uncompressedPoint(publicKey));
    }

    private static byte[] uncompressedPoint(ECPublicKey publicKey) throws Exception {
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec ecSpec = parameters.getParameterSpec(ECParameterSpec.class);
        int coordinateLength = (ecSpec.getCurve().getField().getFieldSize() + 7) / 8;
        byte[] result = new byte[1 + coordinateLength * 2];
        result[0] = 0x04;
        byte[] x = fixedLength(publicKey.getW().getAffineX(), coordinateLength);
        byte[] y = fixedLength(publicKey.getW().getAffineY(), coordinateLength);
        System.arraycopy(x, 0, result, 1, coordinateLength);
        System.arraycopy(y, 0, result, 1 + coordinateLength, coordinateLength);
        return result;
    }

    private static byte[] fixedLength(BigInteger value, int length) {
        byte[] source = value.toByteArray();
        byte[] result = new byte[length];
        int sourceOffset = Math.max(0, source.length - length);
        int copyLength = Math.min(source.length, length);
        System.arraycopy(source, sourceOffset, result, length - copyLength, copyLength);
        return result;
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
