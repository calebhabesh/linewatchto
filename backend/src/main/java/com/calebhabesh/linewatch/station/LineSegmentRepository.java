package com.calebhabesh.linewatch.station;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LineSegmentRepository extends JpaRepository<LineSegmentEntity, String> {
    List<LineSegmentEntity> findAllByOrderBySortOrderAsc();
}
