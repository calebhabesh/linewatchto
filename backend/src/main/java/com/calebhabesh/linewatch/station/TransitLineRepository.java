package com.calebhabesh.linewatch.station;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TransitLineRepository extends JpaRepository<TransitLineEntity, String> {
    List<TransitLineEntity> findAllByOrderBySortOrderAsc();
}
