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
    @Column(name = "watch_return_trip")
    private boolean watchReturnTrip = true;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;

    protected SavedCommuteEntity() {}

    private SavedCommuteEntity(
        String id,
        AccountEntity account,
        String label,
        String originStationId,
        String destinationStationId,
        boolean watchReturnTrip,
        Instant now
    ) {
        this.id = id;
        this.account = account;
        this.label = label;
        this.originStationId = originStationId;
        this.destinationStationId = destinationStationId;
        this.watchReturnTrip = watchReturnTrip;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static SavedCommuteEntity create(String id, AccountEntity account, String label, String originStationId, String destinationStationId, Instant now) {
        return create(id, account, label, originStationId, destinationStationId, true, now);
    }

    public static SavedCommuteEntity create(
        String id,
        AccountEntity account,
        String label,
        String originStationId,
        String destinationStationId,
        boolean watchReturnTrip,
        Instant now
    ) {
        return new SavedCommuteEntity(id, account, label, originStationId, destinationStationId, watchReturnTrip, now);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getLabel() { return label; }
    public String getOriginStationId() { return originStationId; }
    public String getDestinationStationId() { return destinationStationId; }
    public boolean isWatchReturnTrip() { return watchReturnTrip; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
