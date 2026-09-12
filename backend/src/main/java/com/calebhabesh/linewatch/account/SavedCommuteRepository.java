package com.calebhabesh.linewatch.account;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedCommuteRepository extends JpaRepository<SavedCommuteEntity, String> {
    // Serialize route/name writes even when the account has no commutes yet.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from AccountEntity account where account.id = :accountId")
    Optional<AccountEntity> lockCommuteOwner(@Param("accountId") String accountId);

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
