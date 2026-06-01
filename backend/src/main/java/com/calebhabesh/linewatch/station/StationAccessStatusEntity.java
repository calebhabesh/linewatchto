package com.calebhabesh.linewatch.station;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "station_access_statuses")
public class StationAccessStatusEntity {
    @Id
    @Column(name = "station_id")
    private String stationId;
    private String status;
    private String summary;
    @Column(name = "updated_ago")
    private String updatedAgo;

    protected StationAccessStatusEntity() {}

    public StationAccessStatusEntity(String stationId, String status, String summary, String updatedAgo) {
        this.stationId = stationId;
        this.status = status;
        this.summary = summary;
        this.updatedAgo = updatedAgo;
    }

    public String getStationId() { return stationId; }
    public String getStatus() { return status; }
    public String getSummary() { return summary; }
    public String getUpdatedAgo() { return updatedAgo; }
}
