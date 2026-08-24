package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationTokenEntity, String> {
    Optional<EmailVerificationTokenEntity> findByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from EmailVerificationTokenEntity t where t.account.id = :accountId and t.usedAt is null")
    void deleteUnusedByAccountId(@Param("accountId") String accountId);

    @Modifying
    @Query("delete from EmailVerificationTokenEntity t where t.expiresAt < :now")
    void deleteExpiredTokens(@Param("now") Instant now);
}
