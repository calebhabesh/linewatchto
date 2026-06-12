package com.calebhabesh.linewatch.push;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscriptionEntity, String> {
    Optional<PushSubscriptionEntity> findByAccountIdAndEndpointHash(String accountId, String endpointHash);
    List<PushSubscriptionEntity> findByAccountIdAndEnabledTrue(String accountId);

    @Query("""
        select distinct subscription.account.id
        from PushSubscriptionEntity subscription
        where subscription.enabled = true
          and (
            subscription.commuteNotificationsEnabled = true
            or subscription.plannedClosureNotificationsEnabled = true
          )
        """)
    List<String> findEnabledAccountIds();
}
