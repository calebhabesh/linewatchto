package com.calebhabesh.linewatch.station;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationRepository extends JpaRepository<StationEntity, String> {
    List<StationEntity> findAllByOrderBySortOrderAscNameAsc();
}
