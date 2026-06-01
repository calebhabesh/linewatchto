package com.calebhabesh.linewatch.station;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationLineRepository extends JpaRepository<StationLineEntity, Long> {
    List<StationLineEntity> findAllByOrderByStationIdAscSortOrderAsc();
    List<StationLineEntity> findByStationIdOrderBySortOrderAsc(String stationId);
}
