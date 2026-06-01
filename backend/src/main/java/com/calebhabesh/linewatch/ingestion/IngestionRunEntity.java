package com.calebhabesh.linewatch.ingestion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "ingestion_runs")
public class IngestionRunEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "run_type")
    private String runType;
    
    private String status;
    
    @Column(name = "started_at")
    private OffsetDateTime startedAt;
    
    @Column(name = "completed_at")
    private OffsetDateTime completedAt;
    
    @Column(name = "records_processed")
    private int recordsProcessed;
    
    @Column(name = "error_message")
    private String errorMessage;

    protected IngestionRunEntity() {}

    public IngestionRunEntity(String runType, String status, OffsetDateTime startedAt) {
        this.runType = runType;
        this.status = status;
        this.startedAt = startedAt;
    }

    public Long getId() { return id; }
    public String getRunType() { return runType; }
    public String getStatus() { return status; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public int getRecordsProcessed() { return recordsProcessed; }
    public String getErrorMessage() { return errorMessage; }

    public void setStatus(String status) { this.status = status; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
    public void setRecordsProcessed(int recordsProcessed) { this.recordsProcessed = recordsProcessed; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
