package com.calebhabesh.linewatch.push;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPrivateKeySpec;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class VapidWebPushClient implements WebPushClient {
    private static final long VAPID_EXPIRY_SECONDS = 12 * 60 * 60;
    private static final long DEFAULT_PUSH_TTL_SECONDS = 60 * 60;
    private final PushProperties properties;
    private final Clock clock;
    private final HttpClient httpClient;

    @Autowired
    public VapidWebPushClient(PushProperties properties) {
        this(properties, Clock.systemUTC(), HttpClient.newHttpClient());
    }

    VapidWebPushClient(PushProperties properties, Clock clock, HttpClient httpClient) {
        this.properties = properties;
        this.clock = clock;
        this.httpClient = httpClient;
    }

    @Override
    public PushDeliveryResult send(PushSubscriptionEntity subscription, String topic, WebPushPayload payload) {
        if (!properties.webPushConfigured()) {
            return PushDeliveryResult.skipped("Web Push VAPID keys are not configured.");
        }
        try {
            URI endpoint = URI.create(subscription.getEndpoint());
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(endpoint)
                .header("TTL", Long.toString(ttlSeconds(payload)))
                .header("Urgency", "high")
                .header("Authorization", authorizationHeader(endpoint));
            if (topic != null && !topic.isBlank()) {
                requestBuilder.header("Topic", topic.trim());
            }
            if (payload == null) {
                requestBuilder.POST(HttpRequest.BodyPublishers.noBody());
            } else {
                byte[] encryptedPayload = WebPushPayloadEncryption.encrypt(
                    subscription,
                    payload.toJson().getBytes(StandardCharsets.UTF_8)
                );
                requestBuilder
                    .header("Content-Encoding", "aes128gcm")
                    .header("Content-Type", "application/octet-stream")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(encryptedPayload));
            }
            HttpRequest request = requestBuilder.build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() == 404 || response.statusCode() == 410) {
                return PushDeliveryResult.gone(response.statusCode());
            }
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return PushDeliveryResult.accepted(response.statusCode());
            }
            return PushDeliveryResult.failed(response.statusCode(), "Push service rejected the request.");
        } catch (Exception ex) {
            return PushDeliveryResult.failed(null, ex.getMessage());
        }
    }

    private long ttlSeconds(WebPushPayload payload) {
        if (payload == null || payload.ttlSeconds() <= 0) {
            return DEFAULT_PUSH_TTL_SECONDS;
        }
        return payload.ttlSeconds();
    }

    private String authorizationHeader(URI endpoint) throws Exception {
        String token = vapidJwt(endpoint);
        return "vapid t=" + token + ", k=" + properties.getVapidPublicKey().trim();
    }

    private String vapidJwt(URI endpoint) throws Exception {
        String header = base64Url("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String payload = base64Url(payload(endpoint).getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + payload;
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(vapidPrivateKey());
        signature.update(signingInput.getBytes(StandardCharsets.US_ASCII));
        return signingInput + "." + base64Url(derSignatureToJose(signature.sign()));
    }

    private String payload(URI endpoint) {
        long expiresAt = Instant.now(clock).plusSeconds(VAPID_EXPIRY_SECONDS).getEpochSecond();
        return "{\"aud\":\"" + audience(endpoint) + "\",\"exp\":" + expiresAt + ",\"sub\":\"" + subject() + "\"}";
    }

    private String audience(URI endpoint) {
        String scheme = endpoint.getScheme();
        int port = endpoint.getPort();
        boolean defaultPort = port == -1 || ("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80);
        return scheme + "://" + endpoint.getHost() + (defaultPort ? "" : ":" + port);
    }

    private String subject() {
        String subject = properties.getVapidSubject();
        return subject == null || subject.isBlank() ? "mailto:linewatch@example.invalid" : subject.trim();
    }

    private PrivateKey vapidPrivateKey() throws Exception {
        byte[] privateKeyBytes = Base64.getUrlDecoder().decode(properties.getVapidPrivateKey().trim());
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec ecParameters = parameters.getParameterSpec(ECParameterSpec.class);
        ECPrivateKeySpec privateKeySpec = new ECPrivateKeySpec(new BigInteger(1, privateKeyBytes), ecParameters);
        ECPrivateKey key = (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(privateKeySpec);
        return key;
    }

    private byte[] derSignatureToJose(byte[] derSignature) {
        int offset = 0;
        if (derSignature[offset++] != 0x30) {
            throw new IllegalArgumentException("Invalid ECDSA signature sequence.");
        }
        int sequenceLength = derSignature[offset++] & 0xff;
        if (sequenceLength > 0x80) {
            offset += sequenceLength - 0x80;
        }
        if (derSignature[offset++] != 0x02) {
            throw new IllegalArgumentException("Invalid ECDSA signature r value.");
        }
        int rLength = derSignature[offset++] & 0xff;
        byte[] r = fixedJoseInteger(derSignature, offset, rLength);
        offset += rLength;
        if (derSignature[offset++] != 0x02) {
            throw new IllegalArgumentException("Invalid ECDSA signature s value.");
        }
        int sLength = derSignature[offset++] & 0xff;
        byte[] s = fixedJoseInteger(derSignature, offset, sLength);
        byte[] jose = new byte[64];
        System.arraycopy(r, 0, jose, 0, 32);
        System.arraycopy(s, 0, jose, 32, 32);
        return jose;
    }

    private byte[] fixedJoseInteger(byte[] source, int offset, int length) {
        byte[] target = new byte[32];
        int sourceOffset = offset + Math.max(0, length - 32);
        int targetOffset = Math.max(0, 32 - length);
        int copyLength = Math.min(32, length);
        System.arraycopy(source, sourceOffset, target, targetOffset, copyLength);
        return target;
    }

    private String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
