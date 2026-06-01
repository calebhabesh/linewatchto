package com.calebhabesh.linewatch.station;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "stations")
public class StationEntity {
    @Id
    private String id;
    private String name;
    @Column(name = "map_x")
    private int mapX;
    @Column(name = "map_y")
    private int mapY;
    private boolean interchange;
    @Column(name = "sort_order")
    private int sortOrder;

    @Column(columnDefinition = "geometry(Point, 4326)")
    private org.locationtech.jts.geom.Point geom;

    protected StationEntity() {}

    public StationEntity(String id, String name, int mapX, int mapY, boolean interchange, int sortOrder, org.locationtech.jts.geom.Point geom) {
        this.id = id;
        this.name = name;
        this.mapX = mapX;
        this.mapY = mapY;
        this.interchange = interchange;
        this.sortOrder = sortOrder;
        this.geom = geom;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public int getMapX() { return mapX; }
    public int getMapY() { return mapY; }
    public boolean isInterchange() { return interchange; }
    public int getSortOrder() { return sortOrder; }
    public org.locationtech.jts.geom.Point getGeom() { return geom; }
}
