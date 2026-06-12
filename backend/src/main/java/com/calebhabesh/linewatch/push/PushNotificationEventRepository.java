package com.calebhabesh.linewatch.push;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PushNotificationEventRepository extends JpaRepository<PushNotificationEventEntity, String> {
    boolean existsByDedupeKey(String dedupeKey);
}
