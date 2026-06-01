package com.calebhabesh.linewatch.station;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationImpactRepository extends JpaRepository<StationImpactEntity, String> {
    List<StationImpactEntity> findByStationIdOrderBySortOrderAsc(String stationId);
}
