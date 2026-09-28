package com.calebhabesh.linewatch.alert;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface AlertRepository extends JpaRepository<AlertEntity, String> {
    List<AlertEntity> findByActiveTrue();
    List<AlertEntity> findByActiveTrueAndType(String type);
    List<AlertEntity> findByActiveFalseAndTypeAndSourceIdIn(String type, Collection<String> sourceIds);
}
