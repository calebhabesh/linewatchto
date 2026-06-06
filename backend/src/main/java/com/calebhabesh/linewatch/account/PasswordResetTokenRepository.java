package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetTokenEntity, String> {
    Optional<PasswordResetTokenEntity> findByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from PasswordResetTokenEntity t where t.account.id = :accountId and t.usedAt is null")
    int deleteUnusedByAccountId(String accountId);

    @Modifying
    @Query("delete from PasswordResetTokenEntity t where t.expiresAt < :now")
    int deleteExpiredTokens(Instant now);
}
