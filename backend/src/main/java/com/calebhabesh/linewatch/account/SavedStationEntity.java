package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@IdClass(SavedStationId.class)
@Table(name = "saved_stations")
public class SavedStationEntity {
    @Id
    @Column(name = "account_id")
    private String accountId;

    @Id
    @Column(name = "network_id")
    private String networkId;

    @Id
    @Column(name = "station_id")
    private String stationId;

    @Column(name = "created_at")
    private Instant createdAt;

    protected SavedStationEntity() {
    }

    public String getAccountId() {
        return accountId;
    }

    public String getStationId() {
        return stationId;
    }

    public String getNetworkId() {
        return networkId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
