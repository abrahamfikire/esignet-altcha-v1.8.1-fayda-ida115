/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package io.mosip.esignet;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.mosip.esignet.api.dto.claim.Claims;
import io.mosip.esignet.api.spi.AuditPlugin;
import io.mosip.esignet.core.dto.UserConsent;
import io.mosip.esignet.core.dto.UserConsentRequest;
import io.mosip.esignet.entity.ConsentDetail;
import io.mosip.esignet.entity.ConsentHistory;
import io.mosip.esignet.mapper.ConsentMapperImpl;
import io.mosip.esignet.repository.ConsentHistoryRepository;
import io.mosip.esignet.repository.ConsentRepository;
import io.mosip.esignet.services.ConsentServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.*;

import static org.mockito.Mockito.doNothing;

@Slf4j
@ExtendWith(MockitoExtension.class)
public class ConsentServiceImplTest {


    @Mock
    ConsentRepository consentRepository;

    @Mock
    ConsentHistoryRepository consentHistoryRepository;

    @Mock
    AuditPlugin auditWrapper;

    @InjectMocks
    ConsentServiceImpl consentService;

    @InjectMocks
    ConsentMapperImpl consentMapper;

    @BeforeEach
    public void initialize() {
        ReflectionTestUtils.setField(consentMapper, "objectMapper", new ObjectMapper());
        ReflectionTestUtils.setField(consentService, "consentMapper", consentMapper);
    }

    @Test
    public void getUserConsent_withValidDetails_thenPass() throws Exception {
        ConsentDetail consentDetail = new ConsentDetail();
        consentDetail.setId(UUID.randomUUID().toString());
        consentDetail.setClientId("1234");
        consentDetail.setClaims("{\"userinfo\":{\"given_name\":[{\"essential\":true}],\"phone_number\":null,\"email\":[{\"essential\":true}],\"picture\":[{\"essential\":false}],\"gender\":[{\"essential\":false}]},\"id_token\":{}}");
        consentDetail.setCreatedtimes(LocalDateTime.now());
        consentDetail.setPsuToken("psuValue");
        consentDetail.setExpiredtimes(LocalDateTime.now());

        Optional<ConsentDetail> consentOptional = Optional.of(consentDetail);
        Mockito.when(consentRepository.findByClientIdAndPsuToken(Mockito.anyString(), Mockito.anyString())).thenReturn(consentOptional);

        UserConsentRequest userConsentRequest = new UserConsentRequest();
        userConsentRequest.setClientId("1234");
        userConsentRequest.setPsuToken("psuValue");

        Optional<io.mosip.esignet.core.dto.ConsentDetail> userConsentDto = consentService.getUserConsent(userConsentRequest);
        Assertions.assertNotNull(userConsentDto);
        Assertions.assertEquals("1234", userConsentDto.get().getClientId());
        Assertions.assertEquals("psuValue", userConsentDto.get().getPsuToken());

    }

    @Test
    public void getUserConsent_withInValidClaimsDetails_thenTreatAsAbsent() {
        ConsentDetail consentDetail = new ConsentDetail();
        consentDetail.setId(UUID.randomUUID().toString());
        consentDetail.setClientId("1234");
        consentDetail.setCreatedtimes(LocalDateTime.now());
        consentDetail.setClaims("claims");
        consentDetail.setPsuToken("psuValue");
        consentDetail.setExpiredtimes(LocalDateTime.now());

        Optional<ConsentDetail> consentOptional = Optional.of(consentDetail);
        Mockito.when(consentRepository.findByClientIdAndPsuToken(Mockito.anyString(), Mockito.anyString())).thenReturn(consentOptional);

        UserConsentRequest userConsentRequest = new UserConsentRequest();
        userConsentRequest.setClientId("1234");
        userConsentRequest.setPsuToken("psuValue");
        Optional<io.mosip.esignet.core.dto.ConsentDetail> userConsentDto = consentService.getUserConsent(userConsentRequest);
        Assertions.assertEquals(Optional.empty(), userConsentDto);
    }

    @Test
    public void getUserConsent_withLegacyObjectUserinfo_thenPass() {
        ConsentDetail consentDetail = new ConsentDetail();
        consentDetail.setId(UUID.randomUUID().toString());
        consentDetail.setClientId("1234");
        consentDetail.setCreatedtimes(LocalDateTime.now());
        consentDetail.setClaims("{\"userinfo\":{\"given_name\":{\"essential\":true},\"email\":{\"essential\":true}},\"id_token\":{}}");
        consentDetail.setPsuToken("psuValue");
        consentDetail.setExpiredtimes(LocalDateTime.now());

        Mockito.when(consentRepository.findByClientIdAndPsuToken(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(Optional.of(consentDetail));

        UserConsentRequest userConsentRequest = new UserConsentRequest();
        userConsentRequest.setClientId("1234");
        userConsentRequest.setPsuToken("psuValue");

        Optional<io.mosip.esignet.core.dto.ConsentDetail> userConsentDto = consentService.getUserConsent(userConsentRequest);
        Assertions.assertTrue(userConsentDto.isPresent());
        Assertions.assertEquals("1234", userConsentDto.get().getClientId());
        Assertions.assertNotNull(userConsentDto.get().getClaims());
        Assertions.assertNotNull(userConsentDto.get().getClaims().getUserinfo());
        Assertions.assertEquals(1, userConsentDto.get().getClaims().getUserinfo().get("given_name").size());
        Assertions.assertEquals(true, userConsentDto.get().getClaims().getUserinfo().get("given_name").get(0).get("essential"));
    }

    @Test
    public void getUserConsent_withNoClaimsDetails_thenPass() {

        Mockito.when(consentRepository.findByClientIdAndPsuToken(Mockito.anyString(), Mockito.anyString())).thenReturn(Optional.empty());
        UserConsentRequest userConsentRequest = new UserConsentRequest();
        userConsentRequest.setClientId("1234");
        userConsentRequest.setPsuToken("psuValue");

        Optional<io.mosip.esignet.core.dto.ConsentDetail> userConsentDto = consentService.getUserConsent(userConsentRequest);
        Assertions.assertEquals(Optional.empty(), userConsentDto);
    }

    @Test
    public void saveUserConsent_withValidDetails_thenPass() throws Exception {
        Claims claims = new Claims();

        Map<String, List<Map<String, Object>>> userinfo = new HashMap<>();
        Map<String, Map<String, Object>> id_token = new HashMap<>();
        Map<String, Object> userinfoMap = new HashMap<>();
        Map<String, Object> idTokenMap = new HashMap<>();
        userinfoMap.put("value", "value1");
        userinfoMap.put("values", new String[]{"value1a", "value1b"});
        userinfoMap.put("essential", true);

        idTokenMap.put("value", "value2");
        idTokenMap.put("values", new String[]{"value2a", "value2b"});
        idTokenMap.put("essential", false);

        userinfo.put("userinfoKey", Arrays.asList(userinfoMap));
        id_token.put("idTokenKey", idTokenMap);
        claims.setUserinfo(userinfo);
        claims.setId_token(id_token);


        UserConsent userConsent = new UserConsent();
        userConsent.setClientId("1234");
        userConsent.setPsuToken("psuValue");
        userConsent.setClaims(claims);

        Map<String, Boolean> authorizeScopes = Map.of("given_name", true, "email", true);
        userConsent.setAuthorizationScopes(authorizeScopes);
        userConsent.setExpiredtimes(LocalDateTime.now());
        userConsent.setSignature("signature");

        ConsentDetail consentDetail = new ConsentDetail();
        consentDetail.setId(UUID.randomUUID().toString());
        consentDetail.setClientId("1234");
        consentDetail.setClaims("{\"userinfo\":{\"given_name\":[{\"essential\":true}],\"phone_number\":null,\"email\":[{\"essential\":true}],\"picture\":[{\"essential\":false}],\"gender\":[{\"essential\":false}]},\"id_token\":{}}");
        consentDetail.setCreatedtimes(LocalDateTime.now());
        consentDetail.setPsuToken("psuValue");
        consentDetail.setExpiredtimes(LocalDateTime.now());

        doNothing().when(consentRepository).deleteByClientIdAndPsuToken(Mockito.any(), Mockito.any());
        doNothing().when(consentHistoryRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        doNothing().when(consentRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        io.mosip.esignet.core.dto.ConsentDetail userConsentDtoDetail = consentService.saveUserConsent(userConsent);
        Assertions.assertNotNull(userConsentDtoDetail);
        Assertions.assertEquals("1234", userConsentDtoDetail.getClientId());
        Mockito.verify(consentHistoryRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        Mockito.verify(consentRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());

    }

    @Test
    public void saveUserConsent_WhenConsentIsAlreadyPresent_withValidDetails_thenPass() throws Exception {
        Claims claims = new Claims();

        Map<String, List<Map<String, Object>>> userinfo = new HashMap<>();
        Map<String, Map<String, Object>> id_token = new HashMap<>();

        Map<String, Object> userinfoMap = new HashMap<>();
        Map<String, Object> idTokenMap = new HashMap<>();
        userinfoMap.put("value", "value1");
        userinfoMap.put("values", new String[]{"value1a", "value1b"});
        userinfoMap.put("essential", true);

        idTokenMap.put("value", "value2");
        idTokenMap.put("values", new String[]{"value2a", "value2b"});
        idTokenMap.put("essential", false);

        userinfo.put("userinfoKey", Arrays.asList(userinfoMap));
        id_token.put("idTokenKey", idTokenMap);
        claims.setUserinfo(userinfo);
        claims.setId_token(id_token);


        UserConsent userConsent = new UserConsent();
        userConsent.setClientId("1234");
        userConsent.setPsuToken("psuValue");
        userConsent.setClaims(claims);

        Map<String, Boolean> authorizeScopes = Map.of("given_name", true, "email", true);
        userConsent.setAuthorizationScopes(authorizeScopes);
        userConsent.setExpiredtimes(LocalDateTime.now());
        userConsent.setSignature("signature");

        ConsentDetail consentDetail = new ConsentDetail();
        consentDetail.setId(UUID.randomUUID().toString());
        consentDetail.setClientId("1234");
        consentDetail.setClaims("{\"userinfo\":{\"given_name\":[{\"essential\":true}],\"phone_number\":null,\"email\":[{\"essential\":true}],\"picture\":[{\"essential\":false}],\"gender\":[{\"essential\":false}]},\"id_token\":{}}");
        consentDetail.setCreatedtimes(LocalDateTime.now());
        consentDetail.setPsuToken("psuValue");
        consentDetail.setExpiredtimes(LocalDateTime.now());

        doNothing().when(consentRepository).deleteByClientIdAndPsuToken(Mockito.any(), Mockito.any());
        doNothing().when(consentHistoryRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        doNothing().when(consentRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        io.mosip.esignet.core.dto.ConsentDetail userConsentDtoDetail = consentService.saveUserConsent(userConsent);
        Assertions.assertNotNull(userConsentDtoDetail);
        Assertions.assertEquals("1234", userConsentDtoDetail.getClientId());
        Mockito.verify(consentHistoryRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        Mockito.verify(consentRepository).insertNative(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());

    }

    @Test
    public void deleteConsentByClientIdAndPsuToken_thenPass() {
        String clientId = "test-client-id";
        String psuToken = "test-psu-token";
        consentService.deleteUserConsent(clientId, psuToken);
        Mockito.verify(consentRepository).deleteByClientIdAndPsuToken(clientId, psuToken);
    }


}
