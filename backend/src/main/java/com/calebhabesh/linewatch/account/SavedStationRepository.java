package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SavedStationRepository extends JpaRepository<SavedStationEntity, SavedStationId> {
    List<SavedStationEntity> findByAccountIdOrderByCreatedAtDesc(String accountId);

    Optional<SavedStationEntity> findByAccountIdAndStationId(String accountId, String stationId);

    @Modifying
    @Query(value = """
        insert into saved_stations (account_id, station_id, created_at)
        values (:accountId, :stationId, :createdAt)
        on conflict (account_id, station_id) do nothing
        """, nativeQuery = true)
    int insertIfAbsent(
        @Param("accountId") String accountId,
        @Param("stationId") String stationId,
        @Param("createdAt") Instant createdAt
    );

    @Modifying
    int deleteByAccountIdAndStationId(String accountId, String stationId);
}
