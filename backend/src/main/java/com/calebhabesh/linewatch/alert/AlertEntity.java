package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.station.TransitLineEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "alerts")
public class AlertEntity {
    @Id
    private String id;

    @Column(name = "source_id", unique = true)
    private String sourceId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "line_id")
    private TransitLineEntity line;

    private String type;
    private String severity;
    private String title;
    private String description;
    private boolean active;

    @Column(name = "source_alert_type")
    private String sourceAlertType;

    private String effect;

    @Column(name = "effect_description")
    private String effectDescription;

    private String direction;
    private String cause;

    @Column(name = "cause_description")
    private String causeDescription;

    @Column(name = "target_removal")
    private String targetRemoval;

    @Column(name = "impact_kind", nullable = false, length = 32)
    private String impactKind;

    @Column(name = "rsz_length", length = 80)
    private String rszLength;

    @Column(name = "station_distance", length = 80)
    private String stationDistance;

    @Column(name = "track_percent", length = 80)
    private String trackPercent;

    @Column(name = "reduced_speed", length = 80)
    private String reducedSpeed;

    @Column(name = "average_speed", length = 80)
    private String averageSpeed;

    @Column(name = "start_station_id")
    private String startStationId;

    @Column(name = "end_station_id")
    private String endStationId;

    @Column(name = "active_period_start")
    private OffsetDateTime activePeriodStart;

    @Column(name = "active_period_end")
    private OffsetDateTime activePeriodEnd;

    @Column(name = "source_updated_at")
    private OffsetDateTime sourceUpdatedAt;

    @Column(name = "shuttle_type")
    private String shuttleType;

    @Column(name = "shuttle_start")
    private String shuttleStart;

    @Column(name = "shuttle_end")
    private String shuttleEnd;

    @Column(name = "raw_payload")
    private String rawPayload;

    @Column(name = "normalized_fingerprint")
    private String normalizedFingerprint;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "alert_stations", joinColumns = @JoinColumn(name = "alert_id"))
    @OrderColumn(name = "sort_order")
    @Column(name = "station_id")
    private List<String> stationIds = new ArrayList<>();

    protected AlertEntity() {}

    public String getId() { return id; }
    public String getSourceId() { return sourceId; }
    public TransitLineEntity getLine() { return line; }
    public String getType() { return type; }
    public String getSeverity() { return severity; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public boolean isActive() { return active; }
    public String getSourceAlertType() { return sourceAlertType; }
    public String getEffect() { return effect; }
    public String getEffectDescription() { return effectDescription; }
    public String getDirection() { return direction; }
    public String getCause() { return cause; }
    public String getCauseDescription() { return causeDescription; }
    public String getTargetRemoval() { return targetRemoval; }
    public String getImpactKind() { return impactKind; }
    public String getRszLength() { return rszLength; }
    public String getStationDistance() { return stationDistance; }
    public String getTrackPercent() { return trackPercent; }
    public String getReducedSpeed() { return reducedSpeed; }
    public String getAverageSpeed() { return averageSpeed; }
    public String getStartStationId() { return startStationId; }
    public String getEndStationId() { return endStationId; }
    public OffsetDateTime getActivePeriodStart() { return activePeriodStart; }
    public OffsetDateTime getActivePeriodEnd() { return activePeriodEnd; }
    public OffsetDateTime getSourceUpdatedAt() { return sourceUpdatedAt; }
    public String getShuttleType() { return shuttleType; }
    public String getShuttleStart() { return shuttleStart; }
    public String getShuttleEnd() { return shuttleEnd; }
    public String getRawPayload() { return rawPayload; }
    public String getNormalizedFingerprint() { return normalizedFingerprint; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public List<String> getStationIds() { return stationIds; }
}
