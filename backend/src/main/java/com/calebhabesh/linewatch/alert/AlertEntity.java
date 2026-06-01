package com.calebhabesh.linewatch.alert;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "alerts")
public class AlertEntity {
    @Id
    private String id;
    
    @Column(name = "source_id", unique = true)
    private String sourceId;
    
    private String type;
    private String severity;
    private String title;
    private String description;
    private boolean active;
    
    @Column(name = "created_at")
    private OffsetDateTime createdAt;
    
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    protected AlertEntity() {}

    public AlertEntity(String id, String sourceId, String type, String severity, String title, String description, boolean active, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this.id = id;
        this.sourceId = sourceId;
        this.type = type;
        this.severity = severity;
        this.title = title;
        this.description = description;
        this.active = active;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() { return id; }
    public String getSourceId() { return sourceId; }
    public String getType() { return type; }
    public String getSeverity() { return severity; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public boolean isActive() { return active; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
