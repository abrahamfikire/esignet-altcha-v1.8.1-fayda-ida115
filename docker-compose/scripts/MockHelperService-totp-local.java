/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.fasterxml.jackson.databind.ObjectMapper
 *  io.mosip.esignet.api.dto.AuthChallenge
 *  io.mosip.esignet.api.dto.KycAuthDto
 *  io.mosip.esignet.api.dto.KycAuthResult
 *  io.mosip.esignet.api.dto.SendOtpDto
 *  io.mosip.esignet.api.dto.SendOtpResult
 *  io.mosip.esignet.api.exception.KycAuthException
 *  io.mosip.esignet.api.exception.SendOtpException
 *  io.mosip.kernel.core.exception.ServiceError
 *  io.mosip.kernel.core.http.ResponseWrapper
 *  io.mosip.kernel.signature.dto.JWTSignatureRequestDto
 *  io.mosip.kernel.signature.dto.JWTSignatureResponseDto
 *  io.mosip.kernel.signature.service.SignatureService
 *  lombok.Generated
 *  org.slf4j.Logger
 *  org.slf4j.LoggerFactory
 *  org.springframework.beans.factory.annotation.Autowired
 *  org.springframework.beans.factory.annotation.Value
 *  org.springframework.core.ParameterizedTypeReference
 *  org.springframework.http.MediaType
 *  org.springframework.http.RequestEntity
 *  org.springframework.http.ResponseEntity
 *  org.springframework.stereotype.Component
 *  org.springframework.util.CollectionUtils
 *  org.springframework.web.client.RestTemplate
 *  org.springframework.web.util.UriComponentsBuilder
 */
package io.mosip.esignet.plugin.mock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.mosip.esignet.api.dto.AuthChallenge;
import io.mosip.esignet.api.dto.KycAuthDto;
import io.mosip.esignet.api.dto.KycAuthResult;
import io.mosip.esignet.api.dto.SendOtpDto;
import io.mosip.esignet.api.dto.SendOtpResult;
import io.mosip.esignet.api.exception.KycAuthException;
import io.mosip.esignet.api.exception.SendOtpException;
import io.mosip.esignet.plugin.mock.dto.KycAuthRequestDto;
import io.mosip.esignet.plugin.mock.dto.KycAuthResponseDtoV2;
import io.mosip.kernel.core.exception.ServiceError;
import io.mosip.kernel.core.http.ResponseWrapper;
import io.mosip.kernel.signature.dto.JWTSignatureRequestDto;
import io.mosip.kernel.signature.dto.JWTSignatureResponseDto;
import io.mosip.kernel.signature.service.SignatureService;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Base64;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.Generated;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class MockHelperService {
    @Generated
    private static final Logger log = LoggerFactory.getLogger(MockHelperService.class);
    public static final String OIDC_PARTNER_APP_ID = "OIDC_PARTNER";
    private static final Base64.Encoder urlSafeEncoder = Base64.getUrlEncoder().withoutPadding();
    @Value(value="${mosip.esignet.mock.authenticator.send-otp}")
    private String sendOtpUrl;
    @Value(value="${mosip.esignet.mock.authenticator.kyc-auth-url}")
    private String kycAuthUrl;
    @Value(value="${mosip.esignet.mock.authenticator.ida.otp-channels}")
    private List<String> otpChannels;
    /**
     * Optional Fayda TOTP verifier (login). When set, TOTP challenges are checked via
     * POST /v1/totp/verify before mock-identity OTP auth. Leave empty to keep local mock OTP (111111).
     * Enroll + verify-enrollment are separate (see docs/TOTP_ENROLLMENT.md / totp-flow.sh).
     */
    @Value(value="${mosip.esignet.mock.authenticator.totp-verify-url:}")
    private String totpVerifyUrl;
    @Value(value="${mosip.esignet.mock.authenticator.totp-verify-username:id-auth}")
    private String totpVerifyUsername;
    @Value(value="${mosip.esignet.mock.authenticator.totp-verify-password:fayda}")
    private String totpVerifyPassword;
    /** After real TOTP verify succeeds, mock-identity still needs a seeded OTP — use this fixed code. */
    @Value(value="${mosip.esignet.mock.authenticator.totp-mock-otp:111111}")
    private String totpMockOtp;
    @Autowired
    private SignatureService signatureService;
    @Autowired
    private RestTemplate restTemplate;
    @Autowired
    private ObjectMapper objectMapper;
    private static final Map<String, List<String>> supportedKycAuthFormats = new HashMap<String, List<String>>();

    public static String b64Encode(String value) {
        return urlSafeEncoder.encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    public static long getEpochSeconds() {
        return ZonedDateTime.now(ZoneOffset.UTC).toEpochSecond();
    }

    protected static LocalDateTime getUTCDateTime() {
        return ZonedDateTime.now(ZoneOffset.UTC).toLocalDateTime();
    }

    protected String getRequestSignature(String request) {
        JWTSignatureRequestDto jwtSignatureRequestDto = new JWTSignatureRequestDto();
        jwtSignatureRequestDto.setApplicationId(OIDC_PARTNER_APP_ID);
        jwtSignatureRequestDto.setReferenceId("");
        jwtSignatureRequestDto.setIncludePayload(Boolean.valueOf(false));
        jwtSignatureRequestDto.setIncludeCertificate(Boolean.valueOf(true));
        jwtSignatureRequestDto.setDataToSign(MockHelperService.b64Encode(request));
        JWTSignatureResponseDto responseDto = this.signatureService.jwtSign(jwtSignatureRequestDto);
        log.debug("Request signature ---> {}", (Object)responseDto.getJwtSignedData());
        return responseDto.getJwtSignedData();
    }

    public boolean isSupportedOtpChannel(String channel) {
        return channel != null && this.otpChannels.contains(channel.toLowerCase());
    }

    public SendOtpResult sendOtpMock(String transactionId, String individualId, List<String> otpChannels, String relyingPartyId, String clientId) throws SendOtpException {
        try {
            SendOtpDto sendOtpDto = new SendOtpDto();
            sendOtpDto.setTransactionId(transactionId);
            sendOtpDto.setIndividualId(individualId);
            sendOtpDto.setOtpChannels(otpChannels);
            String requestBody = this.objectMapper.writeValueAsString((Object)sendOtpDto);
            RequestEntity requestEntity = RequestEntity.post((URI)UriComponentsBuilder.fromUriString((String)this.sendOtpUrl).pathSegment(new String[]{relyingPartyId, clientId}).build().toUri()).contentType(MediaType.APPLICATION_JSON_UTF8).body((Object)requestBody);
            ResponseEntity responseEntity = this.restTemplate.exchange(requestEntity, new ParameterizedTypeReference<ResponseWrapper<SendOtpResult>>(){});
            if (responseEntity.getStatusCode().is2xxSuccessful() && responseEntity.getBody() != null) {
                ResponseWrapper responseWrapper = (ResponseWrapper)responseEntity.getBody();
                if (responseWrapper.getResponse() != null) {
                    return (SendOtpResult)responseWrapper.getResponse();
                }
                log.error("Errors in response received from IDA send Otp: {}", (Object)responseWrapper.getErrors());
                if (!CollectionUtils.isEmpty((Collection)responseWrapper.getErrors())) {
                    throw new SendOtpException(((ServiceError)responseWrapper.getErrors().get(0)).getErrorCode());
                }
            }
            throw new SendOtpException("send_otp_failed");
        }
        catch (SendOtpException e) {
            throw e;
        }
        catch (Exception e) {
            log.error("send otp failed", (Throwable)e);
            throw new SendOtpException("send_otp_failed");
        }
    }

    public KycAuthResult doKycAuthMock(String relyingPartyId, String clientId, KycAuthDto kycAuthDto, boolean isClaimsMetadataRequired) throws KycAuthException {
        log.info("Started to build kyc-auth request with transactionId : {} && clientId : {} && isClaimsMetadataRequired: {}", new Object[]{kycAuthDto.getTransactionId(), clientId, isClaimsMetadataRequired});
        try {
            KycAuthRequestDto kycAuthRequestDto = new KycAuthRequestDto();
            kycAuthRequestDto.setTransactionId(kycAuthDto.getTransactionId());
            kycAuthRequestDto.setIndividualId(kycAuthDto.getIndividualId());
            kycAuthRequestDto.setClaimMetadataRequired(isClaimsMetadataRequired);
            for (AuthChallenge authChallenge : kycAuthDto.getChallengeList()) {
                if (Objects.equals(authChallenge.getAuthFactorType(), "PIN")) {
                    kycAuthRequestDto.setPin(authChallenge.getChallenge());
                } else if (Objects.equals(authChallenge.getAuthFactorType(), "TOTP")) {
                    // Always call Fayda verifier when configured. totp-mock-otp is ONLY
                    // used to seed mock-identity AFTER a successful external verify —
                    // never accept a user-typed mock code as a shortcut.
                    String otpForMock = authChallenge.getChallenge();
                    if (this.totpVerifyUrl != null && !this.totpVerifyUrl.isBlank()) {
                        this.verifyTotpWithExternalService(
                                kycAuthDto.getIndividualId(), authChallenge.getChallenge());
                        otpForMock = this.totpMockOtp;
                    } else if (this.totpMockOtp == null
                            || !this.totpMockOtp.equals(authChallenge.getChallenge())) {
                        throw new KycAuthException("totp_invalid");
                    }
                    try {
                        this.sendOtpMock(
                                kycAuthDto.getTransactionId(),
                                kycAuthDto.getIndividualId(),
                                this.otpChannels,
                                relyingPartyId,
                                clientId);
                    } catch (SendOtpException e) {
                        throw new KycAuthException(e.getErrorCode());
                    }
                    kycAuthRequestDto.setOtp(otpForMock);
                } else if (Objects.equals(authChallenge.getAuthFactorType(), "OTP")) {
                    kycAuthRequestDto.setOtp(authChallenge.getChallenge());
                } else if (Objects.equals(authChallenge.getAuthFactorType(), "BIO")) {
                    kycAuthRequestDto.setBiometrics(authChallenge.getChallenge());
                } else if (Objects.equals(authChallenge.getAuthFactorType(), "WLA")) {
                    kycAuthRequestDto.setTokens(List.of(authChallenge.getChallenge()));
                } else if (Objects.equals(authChallenge.getAuthFactorType(), "KBI")) {
                    kycAuthRequestDto.setKbi(authChallenge.getChallenge());
                } else if (Objects.equals(authChallenge.getAuthFactorType(), "PWD")) {
                    kycAuthRequestDto.setPassword(authChallenge.getChallenge());
                } else {
                    throw new KycAuthException("invalid_auth_challenge");
                }
                if (this.isKycAuthFormatSupported(authChallenge.getAuthFactorType(), authChallenge.getFormat())) continue;
                throw new KycAuthException("invalid_challenge_format");
            }
            String requestBody = this.objectMapper.writeValueAsString((Object)kycAuthRequestDto);
            RequestEntity requestEntity = RequestEntity.post((URI)UriComponentsBuilder.fromUriString((String)this.kycAuthUrl).pathSegment(new String[]{relyingPartyId, clientId}).build().toUri()).contentType(MediaType.APPLICATION_JSON_UTF8).body((Object)requestBody);
            ResponseEntity responseEntity = this.restTemplate.exchange(requestEntity, new ParameterizedTypeReference<ResponseWrapper<KycAuthResponseDtoV2>>(){});
            if (responseEntity.getStatusCode().is2xxSuccessful() && responseEntity.getBody() != null) {
                ResponseWrapper responseWrapper = (ResponseWrapper)responseEntity.getBody();
                if (responseWrapper.getResponse() != null && ((KycAuthResponseDtoV2)responseWrapper.getResponse()).isAuthStatus() && ((KycAuthResponseDtoV2)responseWrapper.getResponse()).getKycToken() != null) {
                    return this.buildKycAuthResult((KycAuthResponseDtoV2)responseWrapper.getResponse());
                }
                log.error("Error response received from IDA, Errors: {}", (Object)responseWrapper.getErrors());
                throw new KycAuthException(CollectionUtils.isEmpty((Collection)responseWrapper.getErrors()) ? "auth_failed" : ((ServiceError)responseWrapper.getErrors().get(0)).getErrorCode());
            }
            log.error("Error response received from IDA (Kyc-auth) with status : {}", (Object)responseEntity.getStatusCode());
        }
        catch (KycAuthException e) {
            throw e;
        }
        catch (Exception e) {
            log.error("KYC-auth failed with transactionId : {} && clientId : {}", new Object[]{kycAuthDto.getTransactionId(), clientId, e});
        }
        throw new KycAuthException("auth_failed");
    }

    private void verifyTotpWithExternalService(String individualId, String totpCode) throws KycAuthException {
        try {
            Map<String, Object> body = new HashMap<String, Object>();
            body.put("id", "fayda.identity.totp.verify");
            body.put("version", "1.0");
            body.put("requesttime", ZonedDateTime.now(ZoneOffset.UTC).toString());
            Map<String, String> request = new HashMap<String, String>();
            request.put("individualId", individualId);
            request.put("totp", totpCode);
            body.put("request", request);
            String requestBody = this.objectMapper.writeValueAsString(body);
            String basic = Base64.getEncoder().encodeToString(
                    (this.totpVerifyUsername + ":" + this.totpVerifyPassword).getBytes(StandardCharsets.UTF_8));
            RequestEntity requestEntity = RequestEntity
                    .post(URI.create(this.totpVerifyUrl.trim()))
                    .contentType(MediaType.APPLICATION_JSON_UTF8)
                    .header("Authorization", "Basic " + basic)
                    .body(requestBody);
            ResponseEntity responseEntity = this.restTemplate.exchange(
                    requestEntity, new ParameterizedTypeReference<Map<String, Object>>(){});
            if (!responseEntity.getStatusCode().is2xxSuccessful() || responseEntity.getBody() == null) {
                log.error("TOTP verify HTTP failure status={}", (Object)responseEntity.getStatusCode());
                throw new KycAuthException(this.extractTotpErrorCode(responseEntity.getBody()));
            }
            Map responseMap = (Map)responseEntity.getBody();
            Object errors = responseMap.get("errors");
            if (errors instanceof Collection && !((Collection)errors).isEmpty()) {
                log.error("TOTP verify errors: {}", errors);
                throw new KycAuthException(this.extractTotpErrorCode(responseMap));
            }
            Object response = responseMap.get("response");
            if (response instanceof Map) {
                Object status = ((Map)response).get("status");
                if (status != null && "success".equalsIgnoreCase(String.valueOf(status))) {
                    log.info("External TOTP verify succeeded for individualId={}", (Object)individualId);
                    return;
                }
            }
            log.error("TOTP verify unexpected response: {}", responseMap);
            throw new KycAuthException("totp_invalid");
        }
        catch (KycAuthException e) {
            throw e;
        }
        catch (RestClientResponseException e) {
            // Spring 6: HttpClientErrorException extends RestClientResponseException
            // (HttpStatusCodeException is no longer in the hierarchy).
            log.error("TOTP verify HTTP {} body={}", (Object)e.getStatusCode(), (Object)e.getResponseBodyAsString());
            try {
                Map responseMap = this.objectMapper.readValue(e.getResponseBodyAsString(), Map.class);
                throw new KycAuthException(this.extractTotpErrorCode(responseMap));
            }
            catch (KycAuthException ke) {
                throw ke;
            }
            catch (Exception parseEx) {
                throw new KycAuthException("totp_invalid");
            }
        }
        catch (Exception e) {
            log.error("External TOTP verify failed", (Throwable)e);
            throw new KycAuthException("totp_invalid");
        }
    }

    private String extractTotpErrorCode(Object body) {
        if (!(body instanceof Map)) {
            return "auth_failed";
        }
        Object errors = ((Map)body).get("errors");
        if (errors instanceof Collection && !((Collection)errors).isEmpty()) {
            Object first = ((Collection)errors).iterator().next();
            if (first instanceof Map) {
                Object ec = ((Map)first).get("errorCode");
                if (ec != null && !String.valueOf(ec).isBlank()) {
                    return String.valueOf(ec);
                }
            } else if (first instanceof ServiceError) {
                return ((ServiceError)first).getErrorCode();
            }
        }
        return "auth_failed";
    }

    private KycAuthResult buildKycAuthResult(KycAuthResponseDtoV2 response) {
        KycAuthResult kycAuthResult = new KycAuthResult();
        kycAuthResult.setKycToken(response.getKycToken());
        kycAuthResult.setPartnerSpecificUserToken(response.getPartnerSpecificUserToken());
        kycAuthResult.setClaimsMetadata(response.getClaimMetadata());
        return kycAuthResult;
    }

    private boolean isKycAuthFormatSupported(String authFactorType, String kycAuthFormat) {
        List<String> supportedFormat = supportedKycAuthFormats.get(authFactorType);
        return supportedFormat != null && supportedFormat.contains(kycAuthFormat);
    }

    static {
        supportedKycAuthFormats.put("OTP", List.of("alpha-numeric"));
        supportedKycAuthFormats.put("TOTP", List.of("format-totp"));
        supportedKycAuthFormats.put("PWD", List.of("alpha-numeric"));
        supportedKycAuthFormats.put("PIN", List.of("number"));
        supportedKycAuthFormats.put("BIO", List.of("encoded-json"));
        supportedKycAuthFormats.put("WLA", List.of("jwt"));
        supportedKycAuthFormats.put("KBI", List.of("base64url-encoded-json"));
    }
}
