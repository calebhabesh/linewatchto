package com.calebhabesh.linewatch.push;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PushNotificationClientEventRepository extends JpaRepository<PushNotificationClientEventEntity, String> {
    @Query("""
        select clientEvent
        from PushNotificationClientEventEntity clientEvent
        left join fetch clientEvent.delivery delivery
        left join fetch clientEvent.subscription subscription
        where delivery.id in :deliveryIds
        order by clientEvent.occurredAt asc
        """)
    List<PushNotificationClientEventEntity> findByDeliveryIds(@Param("deliveryIds") List<String> deliveryIds);
}
