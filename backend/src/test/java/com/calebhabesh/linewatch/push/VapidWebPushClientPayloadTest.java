package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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
import java.time.ZoneOffset;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class VapidWebPushClientPayloadTest {
    @Test
    @SuppressWarnings("unchecked")
    void sendsEncryptedPayloadWithHighUrgencyForActiveNotifications() throws Exception {
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
        WebPushPayload payload = new WebPushPayload(
            "⚠️ Line 1 Yonge-University Delay",
            "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
            "/?panel=commutes&commute=commute_1",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
            "ACTIVE",
            "2026-06-05T15:00:00Z"
        );

        PushDeliveryResult result = client.send(subscription, "topic-1", payload);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertThat(result.status()).isEqualTo("accepted");
        assertThat(request.headers().firstValue("Topic")).contains("topic-1");
        assertThat(request.headers().firstValue("TTL")).contains("600");
        assertThat(request.headers().firstValue("Urgency")).contains("high");
        assertThat(request.headers().firstValue("Content-Encoding")).contains("aes128gcm");
        assertThat(request.bodyPublisher()).isPresent();
        assertThat(request.bodyPublisher().orElseThrow().contentLength()).isGreaterThan(payload.toJson().length());
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
