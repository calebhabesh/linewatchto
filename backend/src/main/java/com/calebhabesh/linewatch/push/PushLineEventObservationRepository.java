package com.calebhabesh.linewatch.push;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PushLineEventObservationRepository extends JpaRepository<PushLineEventObservationEntity, String> {
    Optional<PushLineEventObservationEntity> findByAccountIdAndNotificationKeyAndClearedAtIsNull(
        String accountId,
        String notificationKey
    );

    List<PushLineEventObservationEntity> findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
        String accountId,
        String sourceIncidentKey
    );

    List<PushLineEventObservationEntity> findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc(String accountId);
}
