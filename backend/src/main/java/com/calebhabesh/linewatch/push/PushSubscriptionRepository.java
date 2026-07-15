package com.calebhabesh.linewatch.push;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscriptionEntity, String> {
    Optional<PushSubscriptionEntity> findByAccountIdAndEndpointHash(String accountId, String endpointHash);
    List<PushSubscriptionEntity> findByAccountIdAndEnabledTrue(String accountId);
    List<PushSubscriptionEntity> findByAccountIdOrderByUpdatedAtDesc(String accountId);
    List<PushSubscriptionEntity> findByAccountIdAndEnabledTrueOrderByUpdatedAtDesc(String accountId);
    List<PushSubscriptionEntity> findByAccountIdAndInstallationIdAndEnabledTrue(String accountId, String installationId);
    Optional<PushSubscriptionEntity> findTopByAccountIdAndInstallationIdOrderByCreatedAtAsc(String accountId, String installationId);
    long countByAccountIdAndEnabledTrue(String accountId);
    long countByAccountIdAndInstallationId(String accountId, String installationId);

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
