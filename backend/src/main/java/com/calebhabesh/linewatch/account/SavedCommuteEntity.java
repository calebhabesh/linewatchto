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
    @Column(name = "network_id")
    private String networkId = "ttc";
    @Column(name = "origin_station_id")
    private String originStationId;
    @Column(name = "destination_station_id")
    private String destinationStationId;
    @Column(name = "watch_return_trip")
    private boolean watchReturnTrip = true;
    @Column(name = "notification_enabled")
    private boolean notificationEnabled = true;
    @Column(name = "notification_day_mask")
    private int notificationDayMask = 62;
    @Column(name = "notification_start_minute")
    private Integer notificationStartMinute = 6 * 60 + 30;
    @Column(name = "notification_end_minute")
    private Integer notificationEndMinute = 9 * 60 + 30;
    @Column(name = "notification_outbound_day_mask")
    private int notificationOutboundDayMask = 62;
    @Column(name = "notification_outbound_start_minute")
    private Integer notificationOutboundStartMinute = 6 * 60 + 30;
    @Column(name = "notification_outbound_end_minute")
    private Integer notificationOutboundEndMinute = 9 * 60 + 30;
    @Column(name = "notification_return_day_mask")
    private int notificationReturnDayMask = 62;
    @Column(name = "notification_return_start_minute")
    private Integer notificationReturnStartMinute = 15 * 60;
    @Column(name = "notification_return_end_minute")
    private Integer notificationReturnEndMinute = 19 * 60;
    @Column(name = "notification_outbound_enabled")
    private boolean notificationOutboundEnabled = true;
    @Column(name = "notification_return_enabled")
    private boolean notificationReturnEnabled = true;
    @Column(name = "notification_suspension_enabled")
    private boolean notificationSuspensionEnabled = true;
    @Column(name = "notification_delay_enabled")
    private boolean notificationDelayEnabled = true;
    @Column(name = "notification_reduced_speed_zone_enabled")
    private boolean notificationReducedSpeedZoneEnabled = true;
    @Column(name = "notification_planned_closure_enabled")
    private boolean notificationPlannedClosureEnabled = true;
    @Column(name = "notification_restored_enabled")
    private boolean notificationRestoredEnabled = true;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;

    protected SavedCommuteEntity() {}

    private SavedCommuteEntity(
        String id,
        AccountEntity account,
        String label,
        String networkId,
        String originStationId,
        String destinationStationId,
        boolean watchReturnTrip,
        Instant now
    ) {
        this.id = id;
        this.account = account;
        this.label = label;
        this.networkId = networkId;
        this.originStationId = originStationId;
        this.destinationStationId = destinationStationId;
        this.watchReturnTrip = watchReturnTrip;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static SavedCommuteEntity create(String id, AccountEntity account, String label, String originStationId, String destinationStationId, Instant now) {
        return create(id, account, label, "ttc", originStationId, destinationStationId, true, now);
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
        return create(id, account, label, "ttc", originStationId, destinationStationId, watchReturnTrip, now);
    }

    public static SavedCommuteEntity create(
        String id,
        AccountEntity account,
        String label,
        String networkId,
        String originStationId,
        String destinationStationId,
        boolean watchReturnTrip,
        Instant now
    ) {
        return new SavedCommuteEntity(id, account, label, networkId, originStationId, destinationStationId, watchReturnTrip, now);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getLabel() { return label; }
    public String getNetworkId() { return networkId == null || networkId.isBlank() ? "ttc" : networkId; }
    public String getOriginStationId() { return originStationId; }
    public String getDestinationStationId() { return destinationStationId; }
    public boolean isWatchReturnTrip() { return watchReturnTrip; }
    public boolean isNotificationEnabled() { return notificationEnabled; }
    public int getNotificationDayMask() { return notificationDayMask; }
    public Integer getNotificationStartMinute() { return notificationStartMinute; }
    public Integer getNotificationEndMinute() { return notificationEndMinute; }
    public int getNotificationOutboundDayMask() { return notificationOutboundDayMask; }
    public Integer getNotificationOutboundStartMinute() { return notificationOutboundStartMinute; }
    public Integer getNotificationOutboundEndMinute() { return notificationOutboundEndMinute; }
    public int getNotificationReturnDayMask() { return notificationReturnDayMask; }
    public Integer getNotificationReturnStartMinute() { return notificationReturnStartMinute; }
    public Integer getNotificationReturnEndMinute() { return notificationReturnEndMinute; }
    public boolean isNotificationOutboundEnabled() { return notificationOutboundEnabled; }
    public boolean isNotificationReturnEnabled() { return notificationReturnEnabled; }
    public boolean isNotificationSuspensionEnabled() { return notificationSuspensionEnabled; }
    public boolean isNotificationDelayEnabled() { return notificationDelayEnabled; }
    public boolean isNotificationReducedSpeedZoneEnabled() { return notificationReducedSpeedZoneEnabled; }
    public boolean isNotificationPlannedClosureEnabled() { return notificationPlannedClosureEnabled; }
    public boolean isNotificationRestoredEnabled() { return notificationRestoredEnabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void updateRoute(
        String label,
        String originStationId,
        String destinationStationId,
        boolean watchReturnTrip,
        Instant now
    ) {
        this.label = label;
        this.originStationId = originStationId;
        this.destinationStationId = destinationStationId;
        this.watchReturnTrip = watchReturnTrip;
        this.updatedAt = now;
    }

    public void updateNotificationRule(
        boolean enabled,
        int dayMask,
        Integer startMinute,
        Integer endMinute,
        boolean outboundEnabled,
        boolean returnEnabled,
        boolean suspensionEnabled,
        boolean delayEnabled,
        boolean reducedSpeedZoneEnabled,
        boolean plannedClosureEnabled,
        boolean restoredEnabled,
        Instant now
    ) {
        updateNotificationRule(
            enabled,
            dayMask,
            startMinute,
            endMinute,
            dayMask,
            startMinute,
            endMinute,
            outboundEnabled,
            returnEnabled,
            suspensionEnabled,
            delayEnabled,
            reducedSpeedZoneEnabled,
            plannedClosureEnabled,
            restoredEnabled,
            now
        );
    }

    public void updateNotificationRule(
        boolean enabled,
        int outboundDayMask,
        Integer outboundStartMinute,
        Integer outboundEndMinute,
        int returnDayMask,
        Integer returnStartMinute,
        Integer returnEndMinute,
        boolean outboundEnabled,
        boolean returnEnabled,
        boolean suspensionEnabled,
        boolean delayEnabled,
        boolean reducedSpeedZoneEnabled,
        boolean plannedClosureEnabled,
        boolean restoredEnabled,
        Instant now
    ) {
        this.notificationEnabled = enabled;
        // Keep the original fields synchronized for cached clients during the API transition.
        this.notificationDayMask = outboundDayMask;
        this.notificationStartMinute = outboundStartMinute;
        this.notificationEndMinute = outboundEndMinute;
        this.notificationOutboundDayMask = outboundDayMask;
        this.notificationOutboundStartMinute = outboundStartMinute;
        this.notificationOutboundEndMinute = outboundEndMinute;
        this.notificationReturnDayMask = returnDayMask;
        this.notificationReturnStartMinute = returnStartMinute;
        this.notificationReturnEndMinute = returnEndMinute;
        this.notificationOutboundEnabled = outboundEnabled;
        this.notificationReturnEnabled = returnEnabled;
        this.notificationSuspensionEnabled = suspensionEnabled;
        this.notificationDelayEnabled = delayEnabled;
        this.notificationReducedSpeedZoneEnabled = reducedSpeedZoneEnabled;
        this.notificationPlannedClosureEnabled = plannedClosureEnabled;
        this.notificationRestoredEnabled = restoredEnabled;
        this.updatedAt = now;
    }
}
