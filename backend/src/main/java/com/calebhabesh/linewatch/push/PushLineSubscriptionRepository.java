package com.calebhabesh.linewatch.push;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PushLineSubscriptionRepository extends JpaRepository<PushLineSubscriptionEntity, String> {
    List<PushLineSubscriptionEntity> findByAccountIdOrderByLineIdAsc(String accountId);
}
