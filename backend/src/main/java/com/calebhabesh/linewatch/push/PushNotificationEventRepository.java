package com.calebhabesh.linewatch.push;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PushNotificationEventRepository extends JpaRepository<PushNotificationEventEntity, String> {
    boolean existsByDedupeKey(String dedupeKey);

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
}
