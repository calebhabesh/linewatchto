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

    @Column(name = "has_washroom")
    private boolean hasWashroom;

    @Column(name = "has_parking")
    private boolean hasParking;

    @Column(name = "has_bicycle_lockup")
    private boolean hasBicycleLockup;

    @Column(name = "has_bicycle_repair")
    private boolean hasBicycleRepair;

    @Column(name = "has_bike_share")
    private boolean hasBikeShare;

    @Column(name = "has_ppudo")
    private boolean hasPpudo;

    protected StationEntity() {}

    public StationEntity(String id, String name, int mapX, int mapY, boolean interchange, int sortOrder, org.locationtech.jts.geom.Point geom) {
        this(id, name, mapX, mapY, interchange, sortOrder, geom, false, false, false, false, false, false);
    }

    public StationEntity(
        String id,
        String name,
        int mapX,
        int mapY,
        boolean interchange,
        int sortOrder,
        org.locationtech.jts.geom.Point geom,
        boolean hasWashroom,
        boolean hasParking
    ) {
        this(id, name, mapX, mapY, interchange, sortOrder, geom, hasWashroom, hasParking, false, false, false, false);
    }

    public StationEntity(
        String id,
        String name,
        int mapX,
        int mapY,
        boolean interchange,
        int sortOrder,
        org.locationtech.jts.geom.Point geom,
        boolean hasWashroom,
        boolean hasParking,
        boolean hasBicycleLockup,
        boolean hasBicycleRepair,
        boolean hasBikeShare,
        boolean hasPpudo
    ) {
        this.id = id;
        this.name = name;
        this.mapX = mapX;
        this.mapY = mapY;
        this.interchange = interchange;
        this.sortOrder = sortOrder;
        this.geom = geom;
        this.hasWashroom = hasWashroom;
        this.hasParking = hasParking;
        this.hasBicycleLockup = hasBicycleLockup;
        this.hasBicycleRepair = hasBicycleRepair;
        this.hasBikeShare = hasBikeShare;
        this.hasPpudo = hasPpudo;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public int getMapX() { return mapX; }
    public int getMapY() { return mapY; }
    public boolean isInterchange() { return interchange; }
    public int getSortOrder() { return sortOrder; }
    public org.locationtech.jts.geom.Point getGeom() { return geom; }
    public boolean hasWashroom() { return hasWashroom; }
    public boolean hasParking() { return hasParking; }
    public boolean hasBicycleLockup() { return hasBicycleLockup; }
    public boolean hasBicycleRepair() { return hasBicycleRepair; }
    public boolean hasBikeShare() { return hasBikeShare; }
    public boolean hasPpudo() { return hasPpudo; }
}
