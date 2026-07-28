package com.calebhabesh.linewatch.account;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedCommuteRepository extends JpaRepository<SavedCommuteEntity, String> {
    List<SavedCommuteEntity> findByAccountIdOrderByCreatedAtAsc(String accountId);
    Optional<SavedCommuteEntity> findByIdAndAccountId(String id, String accountId);
    boolean existsByAccountIdAndNetworkIdAndOriginStationIdAndDestinationStationId(
        String accountId,
        String networkId,
        String originStationId,
        String destinationStationId
    );
    boolean existsByAccountIdAndOriginStationIdAndDestinationStationId(String accountId, String originStationId, String destinationStationId);
}
