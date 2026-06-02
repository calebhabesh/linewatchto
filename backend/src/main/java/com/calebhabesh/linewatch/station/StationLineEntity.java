package com.calebhabesh.linewatch.station;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;

@Entity
@Table(name = "station_lines")
public class StationLineEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "station_id")
    private String stationId;
    @Column(name = "line_id")
    private String lineId;
    @Column(name = "platform_label")
    private String platformLabel;
    @Column(name = "sort_order")
    private int sortOrder;
    @Column(name = "wheelchair_accessible")
    private boolean wheelchairAccessible;
    @Column(name = "has_elevator")
    private boolean hasElevator;

    protected StationLineEntity() {}

    public StationLineEntity(
        Long id,
        String stationId,
        String lineId,
        String platformLabel,
        int sortOrder,
        boolean wheelchairAccessible,
        boolean hasElevator
    ) {
        this.id = id;
        this.stationId = stationId;
        this.lineId = lineId;
        this.platformLabel = platformLabel;
        this.sortOrder = sortOrder;
        this.wheelchairAccessible = wheelchairAccessible;
        this.hasElevator = hasElevator;
    }

    public Long getId() { return id; }
    public String getStationId() { return stationId; }
    public String getLineId() { return lineId; }
    public String getPlatformLabel() { return platformLabel; }
    public int getSortOrder() { return sortOrder; }
    public boolean isWheelchairAccessible() { return wheelchairAccessible; }
    public boolean hasElevator() { return hasElevator; }
}
