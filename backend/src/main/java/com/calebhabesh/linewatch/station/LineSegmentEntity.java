package com.calebhabesh.linewatch.station;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.locationtech.jts.geom.LineString;

@Entity
@Table(name = "line_segments")
public class LineSegmentEntity {
    @Id
    private String id;
    
    @Column(name = "line_id")
    private String lineId;
    
    @Column(name = "station_a_id")
    private String stationAId;
    
    @Column(name = "station_b_id")
    private String stationBId;
    
    @Column(columnDefinition = "geometry(LineString, 4326)")
    private LineString geom;
    
    @Column(name = "svg_path")
    private String svgPath;
    
    @Column(name = "sort_order")
    private int sortOrder;

    protected LineSegmentEntity() {}

    public LineSegmentEntity(String id, String lineId, String stationAId, String stationBId, LineString geom, String svgPath, int sortOrder) {
        this.id = id;
        this.lineId = lineId;
        this.stationAId = stationAId;
        this.stationBId = stationBId;
        this.geom = geom;
        this.svgPath = svgPath;
        this.sortOrder = sortOrder;
    }

    public String getId() { return id; }
    public String getLineId() { return lineId; }
    public String getStationAId() { return stationAId; }
    public String getStationBId() { return stationBId; }
    public LineString getGeom() { return geom; }
    public String getSvgPath() { return svgPath; }
    public int getSortOrder() { return sortOrder; }
}
