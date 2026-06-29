package com.calebhabesh.linewatch.push;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class WebPushPayloadEncryption {
    private static final int SALT_LENGTH = 16;
    private static final int RECORD_SIZE = 4096;
    private static final int GCM_TAG_BITS = 128;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private WebPushPayloadEncryption() {}

    static byte[] encrypt(PushSubscriptionEntity subscription, byte[] plaintext) throws GeneralSecurityException {
        byte[] userPublicKeyBytes = base64UrlDecode(subscription.getP256dhKey());
        byte[] authSecret = base64UrlDecode(subscription.getAuthSecret());
        PublicKey userPublicKey = decodePublicKey(userPublicKeyBytes);

        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair serverKeyPair = generator.generateKeyPair();
        byte[] serverPublicKeyBytes = encodePublicKey((ECPublicKey) serverKeyPair.getPublic());

        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(serverKeyPair.getPrivate());
        agreement.doPhase(userPublicKey, true);
        byte[] sharedSecret = agreement.generateSecret();

        byte[] keyInfo = concat(
            "WebPush: info".getBytes(StandardCharsets.US_ASCII),
            new byte[] { 0 },
            userPublicKeyBytes,
            serverPublicKeyBytes
        );
        byte[] keyPrk = hmacSha256(authSecret, sharedSecret);
        byte[] ikm = hkdfExpand(keyPrk, keyInfo, 32);

        byte[] salt = new byte[SALT_LENGTH];
        SECURE_RANDOM.nextBytes(salt);
        byte[] prk = hmacSha256(salt, ikm);
        byte[] cek = hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

        byte[] recordPlaintext = Arrays.copyOf(plaintext, plaintext.length + 1);
        recordPlaintext[recordPlaintext.length - 1] = 0x02;

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
        byte[] ciphertext = cipher.doFinal(recordPlaintext);

        ByteBuffer body = ByteBuffer.allocate(SALT_LENGTH + 4 + 1 + serverPublicKeyBytes.length + ciphertext.length);
        body.put(salt);
        body.putInt(Math.max(RECORD_SIZE, recordPlaintext.length + 16));
        body.put((byte) serverPublicKeyBytes.length);
        body.put(serverPublicKeyBytes);
        body.put(ciphertext);
        return body.array();
    }

    private static PublicKey decodePublicKey(byte[] encoded) throws GeneralSecurityException {
        if (encoded.length != 65 || encoded[0] != 0x04) {
            throw new GeneralSecurityException("Invalid push subscription public key.");
        }
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec ecSpec = parameters.getParameterSpec(ECParameterSpec.class);
        int coordinateLength = (encoded.length - 1) / 2;
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(encoded, 1, 1 + coordinateLength));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(encoded, 1 + coordinateLength, encoded.length));
        ECPublicKeySpec publicKeySpec = new ECPublicKeySpec(new java.security.spec.ECPoint(x, y), ecSpec);
        return KeyFactory.getInstance("EC").generatePublic(publicKeySpec);
    }

    private static byte[] encodePublicKey(ECPublicKey publicKey) throws GeneralSecurityException {
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec ecSpec = parameters.getParameterSpec(ECParameterSpec.class);
        int coordinateLength = (ecSpec.getCurve().getField().getFieldSize() + 7) / 8;
        byte[] encoded = new byte[1 + coordinateLength * 2];
        encoded[0] = 0x04;
        byte[] x = fixedLength(publicKey.getW().getAffineX(), coordinateLength);
        byte[] y = fixedLength(publicKey.getW().getAffineY(), coordinateLength);
        System.arraycopy(x, 0, encoded, 1, coordinateLength);
        System.arraycopy(y, 0, encoded, 1 + coordinateLength, coordinateLength);
        return encoded;
    }

    private static byte[] fixedLength(BigInteger value, int length) {
        byte[] source = value.toByteArray();
        byte[] target = new byte[length];
        int sourceOffset = Math.max(0, source.length - length);
        int copyLength = Math.min(source.length, length);
        System.arraycopy(source, sourceOffset, target, length - copyLength, copyLength);
        return target;
    }

    private static byte[] hmacSha256(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] hkdfExpand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 1);
        return Arrays.copyOf(mac.doFinal(), length);
    }

    private static byte[] base64UrlDecode(String value) {
        return Base64.getUrlDecoder().decode(value);
    }

    private static byte[] concat(byte[]... parts) {
        int length = 0;
        for (byte[] part : parts) {
            length += part.length;
        }
        byte[] result = new byte[length];
        int offset = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, result, offset, part.length);
            offset += part.length;
        }
        return result;
    }
}
