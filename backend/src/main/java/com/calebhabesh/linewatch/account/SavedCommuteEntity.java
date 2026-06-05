package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "saved_commutes")
public class SavedCommuteEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    private String label;
    @Column(name = "origin_station_id")
    private String originStationId;
    @Column(name = "destination_station_id")
    private String destinationStationId;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;

    protected SavedCommuteEntity() {}

    private SavedCommuteEntity(String id, AccountEntity account, String label, String originStationId, String destinationStationId, Instant now) {
        this.id = id;
        this.account = account;
        this.label = label;
        this.originStationId = originStationId;
        this.destinationStationId = destinationStationId;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static SavedCommuteEntity create(String id, AccountEntity account, String label, String originStationId, String destinationStationId, Instant now) {
        return new SavedCommuteEntity(id, account, label, originStationId, destinationStationId, now);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getLabel() { return label; }
    public String getOriginStationId() { return originStationId; }
    public String getDestinationStationId() { return destinationStationId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
