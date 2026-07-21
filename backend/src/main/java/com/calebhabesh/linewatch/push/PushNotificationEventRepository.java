package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PushNotificationEventRepository extends JpaRepository<PushNotificationEventEntity, String> {
    boolean existsByDedupeKey(String dedupeKey);

    Optional<PushNotificationEventEntity> findByDedupeKey(String dedupeKey);

    Optional<PushNotificationEventEntity> findFirstByAccountIdAndNotificationKeyAndReminderBucketOrderByCreatedAtDesc(
        String accountId,
        String notificationKey,
        String reminderBucket
    );

    boolean existsByNotificationKeyAndNotificationState(String notificationKey, String notificationState);

    List<PushNotificationEventEntity> findByAccountIdAndCategoryAndNotificationState(
        String accountId,
        String category,
        String notificationState
    );

    List<PushNotificationEventEntity> findByAccountIdAndCategoryInAndNotificationState(
        String accountId,
        List<String> categories,
        String notificationState
    );

    List<PushNotificationEventEntity> findByAccountIdAndCategoryInAndNotificationStateAndCreatedAtAfterOrderByCreatedAtDesc(
        String accountId,
        List<String> categories,
        String notificationState,
        Instant createdAtAfter,
        Pageable pageable
    );
}
