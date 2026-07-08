package com.calebhabesh.linewatch.push;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PushSavedCommuteEventObservationRepository
    extends JpaRepository<PushSavedCommuteEventObservationEntity, String> {

    List<PushSavedCommuteEventObservationEntity>
        findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            String accountId,
            String sourceIncidentKey
        );

    List<PushSavedCommuteEventObservationEntity>
        findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc(String accountId);
}
