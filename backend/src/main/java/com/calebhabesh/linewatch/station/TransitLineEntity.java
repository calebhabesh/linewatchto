package com.calebhabesh.linewatch.station;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "transit_lines")
public class TransitLineEntity {
    @Id
    private String id;
    private String number;
    private String name;
    private String color;
    @Column(name = "sort_order")
    private int sortOrder;

    protected TransitLineEntity() {}

    public TransitLineEntity(String id, String number, String name, String color, int sortOrder) {
        this.id = id;
        this.number = number;
        this.name = name;
        this.color = color;
        this.sortOrder = sortOrder;
    }

    public String getId() { return id; }
    public String getNumber() { return number; }
    public String getName() { return name; }
    public String getColor() { return color; }
    public int getSortOrder() { return sortOrder; }
}
