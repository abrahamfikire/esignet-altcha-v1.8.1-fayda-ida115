/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
package io.mosip.esignet.altcha;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AltchaChallengeServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private AltchaChallengeService service;

    @BeforeEach
    void setUp() {
        service = new AltchaChallengeService(
                objectMapper,
                new ConcurrentMapCacheManager("altcha"));
        ReflectionTestUtils.setField(service, "captchaProvider", "altcha");
        ReflectionTestUtils.setField(service, "hmacSignatureSecret",
                "test-hmac-signing-secret-with-32-chars");
        ReflectionTestUtils.setField(service, "hmacKeySignatureSecret",
                "test-key-signing-secret-with-32-chars");
        ReflectionTestUtils.setField(service, "algorithm", "PBKDF2/SHA-256");
        ReflectionTestUtils.setField(service, "cost", 100);
        ReflectionTestUtils.setField(service, "counterMin", 7500);
        ReflectionTestUtils.setField(service, "counterMax", 7500);
        ReflectionTestUtils.setField(service, "expiresInSeconds", 600L);
        ReflectionTestUtils.setField(service, "cacheType", "simple");
    }

    @Test
    void createAndVerifyChallengeConsumesChallengeOnce() throws Exception {
        AltchaChallengeResponse challenge = service.createChallenge();
        assertNotNull(challenge.getParameters());
        assertNotNull(challenge.getSignature());

        Map<String, Object> parameters = objectMapper.convertValue(
                challenge.getParameters(), Map.class);
        byte[] nonce = AltchaCryptoUtil.hexToBytes(String.valueOf(parameters.get("nonce")));
        byte[] salt = AltchaCryptoUtil.hexToBytes(String.valueOf(parameters.get("salt")));
        byte[] derivedKey = AltchaCryptoUtil.pbkdf2Sha256(
                AltchaCryptoUtil.passwordBuffer(nonce, 7500), salt, 100, 32);

        Map<String, Object> payload = new HashMap<>();
        payload.put("challenge", challenge);
        payload.put("solution", Map.of(
                "counter", 7500,
                "derivedKey", AltchaCryptoUtil.bytesToHex(derivedKey),
                "time", 1.0));
        String token = Base64.getEncoder().encodeToString(
                objectMapper.writeValueAsBytes(payload));

        assertTrue(service.verifyPayload(token));
        assertFalse(service.verifyPayload(token));
    }

    @Test
    void verifyPayloadRejectsTamperedSolution() throws Exception {
        AltchaChallengeResponse challenge = service.createChallenge();
        Map<String, Object> payload = new HashMap<>();
        payload.put("challenge", challenge);
        payload.put("solution", Map.of(
                "counter", 7500,
                "derivedKey", "00".repeat(32)));

        assertFalse(service.verifyPayload(Base64.getEncoder().encodeToString(
                objectMapper.writeValueAsBytes(payload))));
    }

    @Test
    void verifyPayloadRejectsMalformedToken() {
        assertFalse(service.verifyPayload("not-base64"));
    }
}
