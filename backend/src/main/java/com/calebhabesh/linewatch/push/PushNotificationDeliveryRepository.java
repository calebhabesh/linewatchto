package com.calebhabesh.linewatch.push;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PushNotificationDeliveryRepository extends JpaRepository<PushNotificationDeliveryEntity, String> {
    @Query("""
        select delivery
        from PushNotificationDeliveryEntity delivery
        join fetch delivery.event event
        join fetch delivery.subscription subscription
        where subscription.account.id = :accountId
          and subscription.endpointHash = :endpointHash
          and subscription.enabled = true
          and delivery.displayedAt is null
        order by delivery.createdAt desc
        """)
    List<PushNotificationDeliveryEntity> findPendingForSubscription(
        @Param("accountId") String accountId,
        @Param("endpointHash") String endpointHash,
        Pageable pageable
    );
}
