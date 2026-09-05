package io.mosip.esignet.mapper;


import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.mosip.esignet.api.dto.claim.Claims;
import io.mosip.esignet.core.dto.ConsentDetail;
import io.mosip.esignet.core.dto.UserConsent;
import io.mosip.esignet.core.exception.EsignetException;
import io.mosip.esignet.entity.ConsentHistory;
import org.apache.commons.lang3.StringUtils;
import org.mapstruct.Mapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import static io.mosip.esignet.core.constants.ErrorConstants.INVALID_CLAIM;
import static io.mosip.esignet.core.constants.ErrorConstants.INVALID_PERMITTED_SCOPE;

@Mapper(componentModel = "spring")
public abstract class ConsentMapper {

    private static final Logger log = LoggerFactory.getLogger(ConsentMapper.class);

    @Autowired
    protected ObjectMapper objectMapper;

    public abstract io.mosip.esignet.entity.ConsentDetail toEntity(UserConsent userConsent);

    public abstract ConsentDetail toDto(io.mosip.esignet.entity.ConsentDetail consentDetail);

    public abstract ConsentHistory toConsentHistoryEntity(UserConsent userConsent);

    public String convertClaimsToString(Claims claims) {
        try {
            return claims != null ? objectMapper.writeValueAsString(claims) : "";
        } catch (JsonProcessingException e) {
            throw new EsignetException(INVALID_CLAIM);
        }
    }

    public Claims convertStringToClaims(String claims) {
        if (StringUtils.isBlank(claims)) {
            return null;
        }
        try {
            return objectMapper.readValue(claims, Claims.class);
        } catch (JsonProcessingException e) {
            Claims normalized = tryNormalizeLegacyClaims(claims);
            if (normalized != null) {
                log.warn("Normalized legacy stored consent claims to eSignet 1.8 shape");
                return normalized;
            }
            log.warn("Unparseable stored consent claims; treating as absent. error={}", e.getOriginalMessage());
            return null;
        }
    }

    /**
     * Older MOSIP/Fayda stored userinfo as Map&lt;String, Map&gt; (object per claim).
     * eSignet 1.8 expects Map&lt;String, List&lt;Map&gt;&gt;. Wrap a single object into a one-element list.
     */
    Claims tryNormalizeLegacyClaims(String claims) {
        try {
            JsonNode root = objectMapper.readTree(claims);
            if (root == null || !root.isObject()) {
                return null;
            }
            ObjectNode objectNode = (ObjectNode) root.deepCopy();
            JsonNode userinfo = objectNode.get("userinfo");
            if (userinfo != null && userinfo.isObject()) {
                ObjectNode userinfoObj = (ObjectNode) userinfo;
                List<String> keys = new ArrayList<>();
                Iterator<String> fieldNames = userinfoObj.fieldNames();
                while (fieldNames.hasNext()) {
                    keys.add(fieldNames.next());
                }
                boolean wrapped = false;
                for (String key : keys) {
                    JsonNode value = userinfoObj.get(key);
                    if (value != null && value.isObject()) {
                        ArrayNode array = objectMapper.createArrayNode();
                        array.add(value);
                        userinfoObj.set(key, array);
                        wrapped = true;
                    }
                }
                if (wrapped) {
                    return objectMapper.treeToValue(objectNode, Claims.class);
                }
            }
            return null;
        } catch (Exception ex) {
            log.warn("Failed to normalize legacy stored consent claims. error={}", ex.getMessage());
            return null;
        }
    }

    public String convertListToString(List<String> list) {
        return list == null ? "" : String.join(",", list);
    }

    public List<String> convertStringToList(String value) {
        return StringUtils.isEmpty(value) ? List.of(): Arrays.asList(value.split(","));
    }

    public String convertMapToString(Map<String, Boolean> map) {
        try{
            return map!=null?objectMapper.writeValueAsString(map):"";
        }catch (JsonProcessingException e) {
            throw new EsignetException(INVALID_PERMITTED_SCOPE);
        }
    }

    public Map<String, Boolean> convertStringToMap(String value) {
        try{
            return StringUtils.isNotBlank(value) ? objectMapper.readValue(value,Map.class): Collections.emptyMap();
        } catch (JsonProcessingException e) {
            throw new EsignetException(INVALID_PERMITTED_SCOPE);
        }
    }
}
