package com.calebhabesh.linewatch.alert;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "snapshots")
public class SnapshotEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "alert_id")
    private String alertId;
    
    private String severity;
    private String description;
    
    @Column(name = "snapshot_time")
    private OffsetDateTime snapshotTime;

    protected SnapshotEntity() {}

    public SnapshotEntity(String alertId, String severity, String description, OffsetDateTime snapshotTime) {
        this.alertId = alertId;
        this.severity = severity;
        this.description = description;
        this.snapshotTime = snapshotTime;
    }

    public Long getId() { return id; }
    public String getAlertId() { return alertId; }
    public String getSeverity() { return severity; }
    public String getDescription() { return description; }
    public OffsetDateTime getSnapshotTime() { return snapshotTime; }
}
