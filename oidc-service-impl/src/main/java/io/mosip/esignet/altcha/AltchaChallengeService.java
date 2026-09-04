/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
package io.mosip.esignet.altcha;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.ReturnType;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
public class AltchaChallengeService {

    private static final int KEY_LENGTH = 32;
    private static final int KEY_PREFIX_LENGTH = 16;
    private static final int NONCE_LENGTH = 16;
    private static final int SALT_LENGTH = 16;
    private static final int CHALLENGE_ID_LENGTH = 16;
    private static final int MAX_PAYLOAD_LENGTH = 64 * 1024;
    private static final long CLOCK_SKEW_SECONDS = 5;
    private static final String ALTCHA_CACHE = "altcha";

    private static final String REGISTER_SCRIPT = """
            if redis.call("EXISTS", KEYS[1]) == 0 then
                redis.call("SETEX", KEYS[1], tonumber(ARGV[1]), "1")
                return 1
            else
                return 0
            end""";

    private static final String CONSUME_SCRIPT = """
            if redis.call("EXISTS", KEYS[1]) == 1 then
                redis.call("DEL", KEYS[1])
                return 1
            else
                return 0
            end""";

    private final ObjectMapper objectMapper;
    private final CacheManager cacheManager;
    @Autowired(required = false)
    private RedisConnectionFactory redisConnectionFactory;

    @Value("${mosip.esignet.captcha.provider:legacy}")
    private String captchaProvider;

    @Value("${mosip.esignet.altcha.hmac-secret:}")
    private String hmacSignatureSecret;

    @Value("${mosip.esignet.altcha.hmac-key-secret:}")
    private String hmacKeySignatureSecret;

    @Value("${mosip.esignet.altcha.algorithm:PBKDF2/SHA-256}")
    private String algorithm;

    @Value("${mosip.esignet.altcha.cost:5000}")
    private int cost;

    @Value("${mosip.esignet.altcha.counter-min:5000}")
    private int counterMin;

    @Value("${mosip.esignet.altcha.counter-max:10000}")
    private int counterMax;

    @Value("${mosip.esignet.altcha.expires-in-seconds:600}")
    private long expiresInSeconds;

    @Value("${mosip.esignet.altcha.challenge-cache-prefix:${mosip.esignet.cache.keyprefix:esignet}:altcha}")
    private String challengeCachePrefix;

    @Value("${spring.cache.type:simple}")
    private String cacheType;

    @Autowired
    public AltchaChallengeService(ObjectMapper objectMapper, CacheManager cacheManager) {
        this.objectMapper = objectMapper;
        this.cacheManager = cacheManager;
    }

    public AltchaChallengeService(ObjectMapper objectMapper) {
        this(objectMapper, null);
    }

    @PostConstruct
    void validateConfiguration() {
        if (!isAltchaEnabled()) {
            return;
        }
        if (hmacSignatureSecret.length() < 32 || hmacKeySignatureSecret.length() < 32) {
            throw new IllegalStateException("ALTCHA HMAC secrets must contain at least 32 characters");
        }
        if (!"PBKDF2/SHA-256".equalsIgnoreCase(algorithm)) {
            throw new IllegalStateException("Unsupported ALTCHA algorithm: " + algorithm);
        }
        if (cost < 1 || cost > 1_000_000) {
            throw new IllegalStateException("ALTCHA cost must be between 1 and 1000000");
        }
        if (counterMin < 0 || counterMax < counterMin || counterMax - counterMin > 1_000_000) {
            throw new IllegalStateException("Invalid ALTCHA counter range");
        }
        if (expiresInSeconds < 1 || expiresInSeconds > 86_400) {
            throw new IllegalStateException("ALTCHA expiry must be between 1 and 86400 seconds");
        }
    }

    public AltchaChallengeResponse createChallenge() throws Exception {
        requireEnabled();

        for (int attempt = 0; attempt < 3; attempt++) {
            int counter = ThreadLocalRandom.current().nextInt(counterMin, counterMax + 1);
            byte[] nonce = AltchaCryptoUtil.randomBytes(NONCE_LENGTH);
            byte[] salt = AltchaCryptoUtil.randomBytes(SALT_LENGTH);
            byte[] challengeId = AltchaCryptoUtil.randomBytes(CHALLENGE_ID_LENGTH);
            byte[] password = AltchaCryptoUtil.passwordBuffer(nonce, counter);
            byte[] derivedKey = AltchaCryptoUtil.pbkdf2Sha256(password, salt, cost, KEY_LENGTH);
            long expiresAt = nowSeconds() + expiresInSeconds;
            String challengeIdHex = AltchaCryptoUtil.bytesToHex(challengeId);

            Map<String, Object> parameters = new HashMap<>();
            parameters.put("algorithm", algorithm);
            parameters.put("challengeId", challengeIdHex);
            parameters.put("nonce", AltchaCryptoUtil.bytesToHex(nonce));
            parameters.put("salt", AltchaCryptoUtil.bytesToHex(salt));
            parameters.put("cost", cost);
            parameters.put("keyLength", KEY_LENGTH);
            parameters.put("keyPrefix",
                    AltchaCryptoUtil.bytesToHex(copyOf(derivedKey, KEY_PREFIX_LENGTH)));
            parameters.put("expiresAt", expiresAt);
            parameters.put("keySignature",
                    AltchaCryptoUtil.hmacSha256Hex(derivedKey, hmacKeySignatureSecret));

            Map<String, Object> sortedParameters = AltchaCryptoUtil.sortKeys(parameters);
            String signature = AltchaCryptoUtil.hmacSha256Hex(
                    objectMapper.writeValueAsString(sortedParameters),
                    hmacSignatureSecret);

            if (registerChallenge(challengeIdHex, expiresInSeconds)) {
                AltchaChallengeResponse response = new AltchaChallengeResponse();
                response.setParameters(objectMapper.valueToTree(sortedParameters));
                response.setSignature(signature);
                return response;
            }
        }

        throw new IllegalStateException("Unable to reserve ALTCHA challenge");
    }

    public boolean verifyPayload(String captchaToken) {
        if (!isAltchaEnabled() || captchaToken == null
                || captchaToken.isBlank() || captchaToken.length() > MAX_PAYLOAD_LENGTH) {
            return false;
        }

        try {
            byte[] decoded = Base64.getDecoder().decode(captchaToken);
            if (decoded.length > MAX_PAYLOAD_LENGTH) {
                return false;
            }

            JsonNode root = objectMapper.readTree(decoded);
            JsonNode challengeNode = root == null ? null : root.get("challenge");
            JsonNode solutionNode = root == null ? null : root.get("solution");
            if (challengeNode == null || solutionNode == null
                    || !challengeNode.isObject() || !solutionNode.isObject()) {
                return false;
            }

            JsonNode parametersNode = challengeNode.get("parameters");
            String signature = challengeNode.path("signature").asText(null);
            if (parametersNode == null || !parametersNode.isObject()
                    || signature == null || signature.isBlank()) {
                return false;
            }

            Map<String, Object> parameters = objectMapper.convertValue(
                    parametersNode, new TypeReference<Map<String, Object>>() {});
            Map<String, Object> sortedParameters = AltchaCryptoUtil.sortKeys(parameters);
            String signatureCheck = AltchaCryptoUtil.hmacSha256Hex(
                    objectMapper.writeValueAsString(sortedParameters),
                    hmacSignatureSecret);
            if (!AltchaCryptoUtil.constantTimeEqual(signature, signatureCheck)) {
                return false;
            }

            if (!algorithm.equalsIgnoreCase(stringValue(parameters.get("algorithm")))
                    || toInt(parameters.get("keyLength"), -1) != KEY_LENGTH
                    || toInt(parameters.get("cost"), -1) != cost) {
                return false;
            }

            long expiresAt = toLong(parameters.get("expiresAt"), 0L);
            if (expiresAt < nowSeconds() - CLOCK_SKEW_SECONDS) {
                return false;
            }

            String challengeId = stringValue(parameters.get("challengeId"));
            String derivedKeyHex = solutionNode.path("derivedKey").asText(null);
            if (challengeId == null || derivedKeyHex == null
                    || derivedKeyHex.length() != KEY_LENGTH * 2) {
                return false;
            }

            byte[] derivedKey = AltchaCryptoUtil.hexToBytes(derivedKeyHex);
            String keySignature = stringValue(parameters.get("keySignature"));
            if (!AltchaCryptoUtil.constantTimeEqual(
                    keySignature,
                    AltchaCryptoUtil.hmacSha256Hex(derivedKey, hmacKeySignatureSecret))) {
                return false;
            }

            JsonNode counterNode = solutionNode.get("counter");
            if (counterNode != null && counterNode.isIntegralNumber()) {
                int counter = counterNode.asInt(-1);
                if (counter < counterMin || counter > counterMax) {
                    return false;
                }
            }

            return consumeChallenge(challengeId);
        } catch (Exception ex) {
            log.warn("Rejected malformed ALTCHA payload");
            return false;
        }
    }

    private boolean isAltchaEnabled() {
        return "altcha".equalsIgnoreCase(captchaProvider);
    }

    private void requireEnabled() {
        if (!isAltchaEnabled()) {
            throw new IllegalStateException("ALTCHA provider is not enabled");
        }
    }

    private boolean registerChallenge(String challengeId, long ttlSeconds) {
        if ("redis".equalsIgnoreCase(cacheType) && redisConnectionFactory != null) {
            return runRedisScript(REGISTER_SCRIPT, challengeId, String.valueOf(ttlSeconds));
        }

        Cache cache = cacheManager.getCache(ALTCHA_CACHE);
        return cache != null && cache.putIfAbsent(challengeId, Boolean.TRUE) == null;
    }

    private boolean consumeChallenge(String challengeId) {
        if ("redis".equalsIgnoreCase(cacheType) && redisConnectionFactory != null) {
            return runRedisScript(CONSUME_SCRIPT, challengeId);
        }

        synchronized (this) {
            Cache cache = cacheManager.getCache(ALTCHA_CACHE);
            if (cache == null || cache.get(challengeId) == null) {
                return false;
            }
            cache.evict(challengeId);
            return true;
        }
    }

    private boolean runRedisScript(String script, String challengeId, String... arguments) {
        RedisConnection connection = redisConnectionFactory.getConnection();
        if (connection == null) {
            return false;
        }
        byte[] key = redisKey(challengeId).getBytes(StandardCharsets.UTF_8);
        byte[][] args = new byte[arguments.length][];
        for (int i = 0; i < arguments.length; i++) {
            args[i] = arguments[i].getBytes(StandardCharsets.UTF_8);
        }
        byte[][] params = new byte[args.length + 1][];
        params[0] = key;
        System.arraycopy(args, 0, params, 1, args.length);
        try {
            Long result = connection.scriptingCommands().eval(
                    script.getBytes(StandardCharsets.UTF_8),
                    ReturnType.INTEGER,
                    1,
                    params);
            return result != null && result == 1L;
        } finally {
            connection.close();
        }
    }

    private String redisKey(String challengeId) {
        return challengeCachePrefix + ":" + challengeId;
    }

    private static long nowSeconds() {
        return System.currentTimeMillis() / 1000L;
    }

    private static byte[] copyOf(byte[] source, int length) {
        byte[] copy = new byte[length];
        System.arraycopy(source, 0, copy, 0, Math.min(source.length, length));
        return copy;
    }

    private static String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static int toInt(Object value, int defaultValue) {
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return value == null ? defaultValue : Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    private static long toLong(Object value, long defaultValue) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return value == null ? defaultValue : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }
}
