package com.calebhabesh.linewatch.push;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PushNotificationPreferenceRepository extends JpaRepository<PushNotificationPreferenceEntity, String> {}
