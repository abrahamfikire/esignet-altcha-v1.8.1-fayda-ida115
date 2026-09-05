/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package io.mosip.esignet.services;


import io.mosip.esignet.api.spi.AuditPlugin;
import io.mosip.esignet.api.util.Action;
import io.mosip.esignet.api.util.ActionStatus;
import io.mosip.esignet.core.dto.ConsentDetail;
import io.mosip.esignet.core.dto.UserConsent;
import io.mosip.esignet.core.dto.UserConsentRequest;
import io.mosip.esignet.core.exception.EsignetException;
import io.mosip.esignet.core.spi.ConsentService;
import io.mosip.esignet.core.util.AuditHelper;
import io.mosip.esignet.entity.ConsentHistory;
import io.mosip.esignet.mapper.ConsentMapper;
import io.mosip.esignet.repository.ConsentHistoryRepository;
import io.mosip.esignet.repository.ConsentRepository;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import jakarta.transaction.Transactional;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class ConsentServiceImpl implements ConsentService {

    @Autowired
    private  ConsentRepository consentRepository;

    @Autowired
    private ConsentHistoryRepository consentHistoryRepository;

    @Autowired
    private AuditPlugin auditWrapper;

    @Value("${mosip.esignet.audit.claim-name:preferred_username}")
    private String claimName;

    @Autowired
    private ConsentMapper consentMapper;

    @Override
    public Optional<ConsentDetail> getUserConsent(UserConsentRequest userConsentRequest) {

        Optional<io.mosip.esignet.entity.ConsentDetail> consentOptional = consentRepository.
                findByClientIdAndPsuToken(userConsentRequest.getClientId(),
                        userConsentRequest.getPsuToken());
        if (consentOptional.isPresent()) {
            io.mosip.esignet.entity.ConsentDetail stored = consentOptional.get();
            try {
                ConsentDetail consentDetailDto = consentMapper.toDto(stored);
                if (consentDetailDto != null && consentDetailDto.getClaims() == null
                        && StringUtils.isNotBlank(stored.getClaims())) {
                    log.warn("Stored consent claims could not be parsed for clientId={}; treating as absent so consent can be recaptured",
                            userConsentRequest.getClientId());
                    return Optional.empty();
                }
                return Optional.of(consentDetailDto);
            } catch (EsignetException e) {
                log.warn("Stored consent could not be mapped for clientId={}; treating as absent so consent can be recaptured. error={}",
                        userConsentRequest.getClientId(), e.getErrorCode());
                return Optional.empty();
            }
        }
        auditWrapper.logAudit(AuditHelper.getClaimValue(SecurityContextHolder.getContext(), claimName),
                Action.GET_USER_CONSENT, ActionStatus.SUCCESS,
                AuditHelper.buildAuditDto(userConsentRequest.getClientId()), null);
        return Optional.empty();
    }

    @Override
    @Transactional
    public ConsentDetail saveUserConsent(UserConsent userConsent) {
        // Do not find+flush a managed ConsentDetail: Hibernate would DELETE WHERE id=?
        // with a String bind and Fayda Postgres rejects uuid = varchar.
        log.info("Replacing stored consent via native delete by client_id and psu_token (avoid uuid=varchar id bind)");
        consentRepository.deleteByClientIdAndPsuToken(userConsent.getClientId(), userConsent.getPsuToken());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        //convert ConsentRequest to Entity
        ConsentHistory consentHistory = consentMapper.toConsentHistoryEntity(userConsent);
        consentHistory.setId(UUID.randomUUID().toString());
        consentHistory.setCreatedtimes(now);
        // Hibernate 6 ignores @Convert on @Id, so persist() still binds varchar.
        consentHistoryRepository.insertNative(
                consentHistory.getId(),
                consentHistory.getAcceptedClaims(),
                consentHistory.getAuthorizationScopes(),
                consentHistory.getClaims(),
                consentHistory.getClientId(),
                consentHistory.getCreatedtimes(),
                consentHistory.getExpiredtimes(),
                consentHistory.getHash(),
                consentHistory.getPermittedScopes(),
                consentHistory.getPsuToken(),
                consentHistory.getSignature());

        io.mosip.esignet.entity.ConsentDetail consentDetail = consentMapper.toEntity(userConsent);
        consentDetail.setId(UUID.randomUUID().toString());
        consentDetail.setCreatedtimes(now);
        consentRepository.insertNative(
                consentDetail.getId(),
                consentDetail.getAcceptedClaims(),
                consentDetail.getAuthorizationScopes(),
                consentDetail.getClaims(),
                consentDetail.getClientId(),
                consentDetail.getCreatedtimes(),
                consentDetail.getExpiredtimes(),
                consentDetail.getHash(),
                consentDetail.getPermittedScopes(),
                consentDetail.getPsuToken(),
                consentDetail.getSignature());

        ConsentDetail consentDetailDto = consentMapper.toDto(consentDetail);
        auditWrapper.logAudit(AuditHelper.getClaimValue(SecurityContextHolder.getContext(), claimName),
                Action.SAVE_USER_CONSENT, ActionStatus.SUCCESS,
                AuditHelper.buildAuditDto(userConsent.getClientId()), null);
        return consentDetailDto;
    }

    @Override
    @Transactional
    public void deleteUserConsent(String clientId, String psuToken) {
        consentRepository.deleteByClientIdAndPsuToken(clientId, psuToken);
    }
}
