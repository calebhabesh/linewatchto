package com.calebhabesh.linewatch.station;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "station_impacts")
public class StationImpactEntity {
    @Id
    private String id;
    @Column(name = "station_id")
    private String stationId;
    private String type;
    private String severity;
    private String title;
    private String summary;
    @Column(name = "updated_ago")
    private String updatedAgo;
    private String source;
    @Column(name = "sort_order")
    private int sortOrder;

    protected StationImpactEntity() {}

    public StationImpactEntity(String id, String stationId, String type, String severity, String title, String summary, String updatedAgo, String source, int sortOrder) {
        this.id = id;
        this.stationId = stationId;
        this.type = type;
        this.severity = severity;
        this.title = title;
        this.summary = summary;
        this.updatedAgo = updatedAgo;
        this.source = source;
        this.sortOrder = sortOrder;
    }

    public String getId() { return id; }
    public String getStationId() { return stationId; }
    public String getType() { return type; }
    public String getSeverity() { return severity; }
    public String getTitle() { return title; }
    public String getSummary() { return summary; }
    public String getUpdatedAgo() { return updatedAgo; }
    public String getSource() { return source; }
    public int getSortOrder() { return sortOrder; }
}
