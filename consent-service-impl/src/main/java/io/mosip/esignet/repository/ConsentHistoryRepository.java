/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package io.mosip.esignet.repository;



import io.mosip.esignet.entity.ConsentHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface ConsentHistoryRepository extends JpaRepository<ConsentHistory, String>{

      /**
       * Hibernate 6 ignores @Convert on @Id, so persist() binds id as varchar.
       * CAST(:id AS uuid) lets Postgres accept the assigned String id.
       */
      @Modifying(clearAutomatically = true, flushAutomatically = true)
      @Query(value = "insert into consent_history (id, accepted_claims, authorization_scopes, claims, client_id, cr_dtimes, expire_dtimes, hash, permitted_scopes, psu_token, signature) values (CAST(:id AS uuid), :acceptedClaims, :authorizationScopes, :claims, :clientId, :createdtimes, :expiredtimes, :hash, :permittedScopes, :psuToken, :signature)", nativeQuery = true)
      void insertNative(@Param("id") String id,
                        @Param("acceptedClaims") String acceptedClaims,
                        @Param("authorizationScopes") String authorizationScopes,
                        @Param("claims") String claims,
                        @Param("clientId") String clientId,
                        @Param("createdtimes") LocalDateTime createdtimes,
                        @Param("expiredtimes") LocalDateTime expiredtimes,
                        @Param("hash") String hash,
                        @Param("permittedScopes") String permittedScopes,
                        @Param("psuToken") String psuToken,
                        @Param("signature") String signature);

}