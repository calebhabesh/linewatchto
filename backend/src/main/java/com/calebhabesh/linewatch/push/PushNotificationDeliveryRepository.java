package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PushNotificationDeliveryRepository extends JpaRepository<PushNotificationDeliveryEntity, String> {
    Optional<PushNotificationDeliveryEntity> findByEventIdAndSubscriptionId(String eventId, String subscriptionId);

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

    @Query("""
        select delivery
        from PushNotificationDeliveryEntity delivery
        join fetch delivery.event event
        join fetch delivery.subscription subscription
        where subscription.account.id = :accountId
          and subscription.endpointHash = :endpointHash
          and subscription.enabled = true
          and delivery.displayedAt is null
          and event.createdAt >= :eventCreatedAtAfter
        order by delivery.createdAt asc
        """)
    List<PushNotificationDeliveryEntity> findPendingBatchForSubscription(
        @Param("accountId") String accountId,
        @Param("endpointHash") String endpointHash,
        @Param("eventCreatedAtAfter") Instant eventCreatedAtAfter,
        Pageable pageable
    );

    @Query("""
        select delivery
        from PushNotificationDeliveryEntity delivery
        join fetch delivery.event event
        join fetch delivery.subscription subscription
        where subscription.account.id = :accountId
          and subscription.endpointHash = :endpointHash
          and subscription.enabled = true
          and delivery.displayedAt is null
        order by delivery.createdAt asc
        """)
    List<PushNotificationDeliveryEntity> findPendingBatchForSubscription(
        @Param("accountId") String accountId,
        @Param("endpointHash") String endpointHash,
        Pageable pageable
    );

    @Query("""
        select delivery
        from PushNotificationDeliveryEntity delivery
        join fetch delivery.event event
        join fetch delivery.subscription subscription
        where subscription.account.id = :accountId
          and subscription.endpointHash = :endpointHash
          and subscription.enabled = true
          and delivery.displayedAt is null
          and event.notificationKey = :notificationKey
          and event.notificationState = :notificationState
        order by delivery.createdAt asc
        """)
    List<PushNotificationDeliveryEntity> findPendingDeliveryForNotification(
        @Param("accountId") String accountId,
        @Param("endpointHash") String endpointHash,
        @Param("notificationKey") String notificationKey,
        @Param("notificationState") String notificationState,
        Pageable pageable
    );

    @Query("""
        select delivery
        from PushNotificationDeliveryEntity delivery
        join fetch delivery.event event
        join fetch delivery.subscription subscription
        where subscription.account.id = :accountId
          and subscription.endpointHash = :endpointHash
          and event.notificationKey = :notificationKey
          and event.notificationState = :notificationState
        order by delivery.createdAt desc
        """)
    List<PushNotificationDeliveryEntity> findLatestDeliveryForNotification(
        @Param("accountId") String accountId,
        @Param("endpointHash") String endpointHash,
        @Param("notificationKey") String notificationKey,
        @Param("notificationState") String notificationState,
        Pageable pageable
    );

    @Query("""
        select delivery
        from PushNotificationDeliveryEntity delivery
        join fetch delivery.event event
        join fetch delivery.subscription subscription
        where subscription.account.id = :accountId
          and event.createdAt >= :since
        """)
    List<PushNotificationDeliveryEntity> findDeliveriesForAccountSince(
        @Param("accountId") String accountId,
        @Param("since") Instant since
    );

    @Query("""
        select distinct event.notificationKey
        from PushNotificationDeliveryEntity delivery
        join delivery.event event
        join delivery.subscription subscription
        where subscription.account.id = :accountId
          and subscription.endpointHash = :endpointHash
          and subscription.enabled = true
          and delivery.displayedAt is not null
          and event.notificationState = 'CLEARED'
          and event.category in :categories
          and delivery.displayedAt >= :displayedAtAfter
        """)
    List<String> findRecentlyDisplayedClearedNotificationKeys(
        @Param("accountId") String accountId,
        @Param("endpointHash") String endpointHash,
        @Param("categories") List<String> categories,
        @Param("displayedAtAfter") Instant displayedAtAfter
    );

    /** Whether any endpoint of this installation already showed the event (catch-up never re-notifies it). */
    @Query("""
        select count(delivery) > 0
        from PushNotificationDeliveryEntity delivery
        join delivery.subscription subscription
        where delivery.event.id = :eventId
          and subscription.account.id = :accountId
          and subscription.installationId = :installationId
          and delivery.displayedAt is not null
        """)
    boolean existsDisplayedForInstallation(
        @Param("eventId") String eventId,
        @Param("accountId") String accountId,
        @Param("installationId") String installationId
    );

    /** Whether any of these endpoints already showed the event. */
    @Query("""
        select count(delivery) > 0
        from PushNotificationDeliveryEntity delivery
        where delivery.event.id = :eventId
          and delivery.subscription.id in :subscriptionIds
          and delivery.displayedAt is not null
        """)
    boolean existsDisplayedForSubscriptions(
        @Param("eventId") String eventId,
        @Param("subscriptionIds") List<String> subscriptionIds
    );
}
