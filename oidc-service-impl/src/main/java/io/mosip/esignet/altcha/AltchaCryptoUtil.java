/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
package io.mosip.esignet.altcha;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;

final class AltchaCryptoUtil {

    private static final char[] HEX = "0123456789abcdef".toCharArray();
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private AltchaCryptoUtil() {
    }

    static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        SECURE_RANDOM.nextBytes(bytes);
        return bytes;
    }

    static String bytesToHex(byte[] bytes) {
        char[] result = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int value = bytes[i] & 0xff;
            result[i * 2] = HEX[value >>> 4];
            result[i * 2 + 1] = HEX[value & 0x0f];
        }
        return new String(result);
    }

    static byte[] hexToBytes(String hex) {
        if (hex == null || (hex.length() & 1) != 0) {
            throw new IllegalArgumentException("Hex value must have an even length");
        }
        byte[] result = new byte[hex.length() / 2];
        for (int i = 0; i < hex.length(); i += 2) {
            int high = Character.digit(hex.charAt(i), 16);
            int low = Character.digit(hex.charAt(i + 1), 16);
            if (high < 0 || low < 0) {
                throw new IllegalArgumentException("Hex value contains an invalid character");
            }
            result[i / 2] = (byte) ((high << 4) | low);
        }
        return result;
    }

    static boolean constantTimeEqual(String left, String right) {
        if (left == null || right == null || left.length() != right.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < left.length(); i++) {
            result |= left.charAt(i) ^ right.charAt(i);
        }
        return result == 0;
    }

    static byte[] passwordBuffer(byte[] nonce, int counter) {
        ByteBuffer buffer = ByteBuffer.allocate(nonce.length + Integer.BYTES);
        buffer.put(nonce);
        buffer.putInt(counter);
        return buffer.array();
    }

    /**
     * RFC 2898 PBKDF2-HMAC-SHA256 over raw password bytes.
     * PBEKeySpec is intentionally not used because it converts passwords to
     * characters, while the ALTCHA browser implementation uses raw bytes.
     */
    static byte[] pbkdf2Sha256(byte[] password, byte[] salt, int iterations, int keyLength)
            throws Exception {
        if (iterations <= 0 || keyLength <= 0) {
            throw new IllegalArgumentException("PBKDF2 parameters must be positive");
        }

        Mac hmac = Mac.getInstance("HmacSHA256");
        hmac.init(new SecretKeySpec(password, "HmacSHA256"));
        int hashLength = hmac.getMacLength();
        int blockCount = (keyLength + hashLength - 1) / hashLength;
        byte[] derived = new byte[blockCount * hashLength];
        byte[] blockSalt = Arrays.copyOf(salt, salt.length + Integer.BYTES);

        for (int block = 1; block <= blockCount; block++) {
            blockSalt[salt.length] = (byte) (block >>> 24);
            blockSalt[salt.length + 1] = (byte) (block >>> 16);
            blockSalt[salt.length + 2] = (byte) (block >>> 8);
            blockSalt[salt.length + 3] = (byte) block;

            byte[] u = hmac.doFinal(blockSalt);
            byte[] t = Arrays.copyOf(u, u.length);
            for (int iteration = 1; iteration < iterations; iteration++) {
                u = hmac.doFinal(u);
                for (int i = 0; i < t.length; i++) {
                    t[i] ^= u[i];
                }
            }
            System.arraycopy(t, 0, derived, (block - 1) * hashLength, hashLength);
        }
        return Arrays.copyOf(derived, keyLength);
    }

    static String hmacSha256Hex(String data, String secret) throws Exception {
        return hmacSha256Hex(data.getBytes(StandardCharsets.UTF_8), secret);
    }

    static String hmacSha256Hex(byte[] data, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return bytesToHex(mac.doFinal(data));
    }

    static Map<String, Object> sortKeys(Map<String, Object> input) {
        Map<String, Object> sorted = new TreeMap<>();
        for (Map.Entry<String, Object> entry : input.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> nested = (Map<String, Object>) value;
                sorted.put(entry.getKey(), sortKeys(nested));
            } else {
                sorted.put(entry.getKey(), value);
            }
        }
        return sorted;
    }
}
