package com.calebhabesh.linewatch.push;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PushSubscriptionLifecycleEventRepository extends JpaRepository<PushSubscriptionLifecycleEventEntity, String> {
    List<PushSubscriptionLifecycleEventEntity> findByAccountIdOrderByOccurredAtDesc(String accountId, Pageable pageable);
}
