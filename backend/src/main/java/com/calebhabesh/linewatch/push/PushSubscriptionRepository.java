package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscriptionEntity, String> {
    Optional<PushSubscriptionEntity> findByAccountIdAndEndpointHash(String accountId, String endpointHash);
    List<PushSubscriptionEntity> findByEndpointHashAndEnabledTrue(String endpointHash);
    List<PushSubscriptionEntity> findByAccountIdAndEnabledTrue(String accountId);

    /** Enabled endpoints that replaced an earlier endpoint of their installation, enabled in the window. */
    @Query("""
        select s.id as id, s.account.id as accountId from PushSubscriptionEntity s
        where s.enabled = true and s.enabledAt > :enabledAfter and s.enabledAt <= :enabledBy
          and s.installationEnabledAt < s.enabledAt
        """)
    List<ReplacementRef> findEnabledReplacements(
        @Param("enabledAfter") Instant enabledAfter,
        @Param("enabledBy") Instant enabledBy
    );

    interface ReplacementRef {
        String getId();
        String getAccountId();
    }
    List<PushSubscriptionEntity> findByAccountIdOrderByUpdatedAtDesc(String accountId);
    List<PushSubscriptionEntity> findByAccountIdAndEnabledTrueOrderByUpdatedAtDesc(String accountId);
    List<PushSubscriptionEntity> findByAccountIdAndInstallationIdAndEnabledTrue(String accountId, String installationId);
    Optional<PushSubscriptionEntity> findFirstByAccountIdAndInstallationIdAndEndpointHashNotOrderByCreatedAtDesc(
        String accountId, String installationId, String endpointHash
    );
    long countByAccountIdAndEnabledTrue(String accountId);

    @Query("""
        select subscription
        from PushSubscriptionEntity subscription
        where subscription.id = :id
          and subscription.account.id = :accountId
        """)
    Optional<PushSubscriptionEntity> findByIdAndAccountId(String id, String accountId);

    @Query("""
        select distinct subscription.account.id
        from PushSubscriptionEntity subscription
        where subscription.enabled = true
        """)
    List<String> findEnabledAccountIds();
}
