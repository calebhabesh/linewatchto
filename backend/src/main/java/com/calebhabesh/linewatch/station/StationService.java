package com.calebhabesh.linewatch.station;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

@Service
public class StationService {
    private static final String DATA_MODE = "seeded-demo";
    private static final String DEMO_ARRIVALS_DISCLAIMER =
        "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions.";
    private static final String SCHEDULED_ARRIVALS_DISCLAIMER =
        "Scheduled arrivals use TTC timetable data and are not live train predictions.";
    private static final String UNAVAILABLE_ARRIVALS_DISCLAIMER =
        "Scheduled arrival data is currently unavailable. Arrival predictions are not live TTC predictions.";
    private static final String LIVE_ARRIVALS_DISCLAIMER =
        "Arrival predictions are source-labeled and may be affected by active TTC service alerts.";
    private static final StationResponses.StationAccessOutageCountsResponse ZERO_ACCESS_OUTAGE_COUNTS =
        new StationResponses.StationAccessOutageCountsResponse(0, 0);

    private final StationRepository stationRepository;
    private final TransitLineRepository transitLineRepository;
    private final StationLineRepository stationLineRepository;
    private final StationAccessStatusRepository accessStatusRepository;
    private final StationImpactRepository impactRepository;
    private final StationLiveReadRepository liveReadRepository;
    private final IngestionFreshness ingestionFreshness;
    private final ArrivalService arrivalService;
    private final AlertDashboardService alertDashboardService;

    public StationService(
        StationRepository stationRepository,
        TransitLineRepository transitLineRepository,
        StationLineRepository stationLineRepository,
        StationAccessStatusRepository accessStatusRepository,
        StationImpactRepository impactRepository,
        StationLiveReadRepository liveReadRepository,
        IngestionFreshness ingestionFreshness,
        ArrivalService arrivalService,
        AlertDashboardService alertDashboardService
    ) {
        this.stationRepository = stationRepository;
        this.transitLineRepository = transitLineRepository;
        this.stationLineRepository = stationLineRepository;
        this.accessStatusRepository = accessStatusRepository;
        this.impactRepository = impactRepository;
        this.liveReadRepository = liveReadRepository;
        this.ingestionFreshness = ingestionFreshness;
        this.arrivalService = arrivalService;
        this.alertDashboardService = alertDashboardService;
    }

    public StationResponses.StationListResponse stationSummaries() {
        List<StationEntity> stations = stationRepository.findAllByOrderBySortOrderAscNameAsc();
        Map<String, List<String>> lineIdsByStation = stationLineRepository.findAllByOrderByStationIdAscSortOrderAsc()
            .stream()
            .collect(Collectors.groupingBy(
                StationLineEntity::getStationId,
                Collectors.mapping(StationLineEntity::getLineId, Collectors.toList())
            ));
        boolean dashboardFresh = ingestionFreshness.isDashboardFresh();
        Map<String, StationResponses.StationAccessOutageCountsResponse> accessOutageCountsByStation = dashboardFresh
            ? accessOutageCounts(liveReadRepository.findActiveOutageCountsByStationId())
            : Map.of();
        Map<String, String> accessByStation = dashboardFresh
            ? statuses(accessOutageCountsByStation.keySet(), "outage")
            : accessStatusRepository.findAll()
                .stream()
                .collect(Collectors.toMap(
                    StationAccessStatusEntity::getStationId,
                    StationAccessStatusEntity::getStatus
                ));
        Map<String, Boolean> activeImpactByStation = dashboardFresh
            ? flags(liveReadRepository.findStationIdsWithActiveAlerts())
            : impactRepository.findAll()
                .stream()
                .collect(Collectors.toMap(
                    StationImpactEntity::getStationId,
                    impact -> impact.getType().equals("active-alert"),
                    Boolean::logicalOr
                ));

        List<StationResponses.StationSummaryResponse> summaries = stations.stream()
            .map(station -> new StationResponses.StationSummaryResponse(
                station.getId(),
                station.getName(),
                station.getMapX(),
                station.getMapY(),
                station.isInterchange(),
                lineIdsByStation.getOrDefault(station.getId(), List.of()),
                activeImpactByStation.getOrDefault(station.getId(), false),
                accessByStation.getOrDefault(station.getId(), "normal"),
                accessOutageCountsByStation.getOrDefault(station.getId(), ZERO_ACCESS_OUTAGE_COUNTS)
            ))
            .toList();

        return new StationResponses.StationListResponse(DATA_MODE, summaries);
    }

    public StationResponses.StationDetailResponse stationDetail(String id) {
        StationEntity station = stationRepository.findById(id)
            .orElseThrow(() -> new StationNotFoundException(id));

        List<StationLineEntity> stationLines = stationLineRepository.findByStationIdOrderBySortOrderAsc(id);
        List<String> lineIds = stationLines.stream().map(StationLineEntity::getLineId).toList();
        Map<String, TransitLineEntity> linesById = transitLineRepository.findAllById(lineIds)
            .stream()
            .collect(Collectors.toMap(TransitLineEntity::getId, Function.identity()));

        List<StationResponses.StationLineResponse> lines = stationLines.stream()
            .map(stationLine -> toLineResponse(stationLine, linesById.get(stationLine.getLineId())))
            .sorted(Comparator.comparing(StationResponses.StationLineResponse::id))
            .toList();

        boolean dashboardFresh = ingestionFreshness.isDashboardFresh();
        StationResponses.StationAccessResponse access = dashboardFresh
            ? toLiveAccessResponse(liveReadRepository.findActiveOutagesByStationId(id))
            : accessStatusRepository.findById(id)
                .map(this::toAccessResponse)
                .orElse(new StationResponses.StationAccessResponse(
                    "normal",
                    "No station access advisories in demo data.",
                    "Fixture seed",
                    List.of()
                ));

        List<StationResponses.StationImpactResponse> impacts = dashboardFresh
            ? toLiveImpactResponses(id)
            : impactRepository.findByStationIdOrderBySortOrderAsc(id)
                .stream()
                .map(this::toImpactResponse)
                .toList();

        List<ArrivalPrediction> predictions = arrivalService.arrivalsFor(station.getId(), lines);
        List<StationResponses.StationArrivalResponse> arrivals = predictions.stream()
            .map(pred -> new StationResponses.StationArrivalResponse(
                pred.lineId(),
                pred.direction(),
                pred.minutes(),
                pred.predictedAt(),
                pred.label(),
                pred.source(),
                pred.status()
            ))
            .toList();

        String arrivalsSource = arrivalSourceFor(predictions);

        return new StationResponses.StationDetailResponse(
            station.getId(),
            station.getName(),
            station.getMapX(),
            station.getMapY(),
            station.isInterchange(),
            lines,
            access,
            impacts,
            arrivals,
            arrivalsSource,
            toArrivalContext(impacts),
            DATA_MODE,
            disclaimerFor(predictions)
        );
    }

    private String disclaimerFor(List<ArrivalPrediction> predictions) {
        if (predictions.stream().anyMatch(prediction -> prediction.status().equals("live"))) {
            return LIVE_ARRIVALS_DISCLAIMER;
        }
        if (predictions.stream().anyMatch(prediction -> prediction.status().equals("scheduled"))) {
            return SCHEDULED_ARRIVALS_DISCLAIMER;
        }
        if (predictions.stream().anyMatch(prediction -> prediction.status().equals("unavailable"))) {
            return UNAVAILABLE_ARRIVALS_DISCLAIMER;
        }
        return DEMO_ARRIVALS_DISCLAIMER;
    }

    private String arrivalSourceFor(List<ArrivalPrediction> predictions) {
        if (predictions.isEmpty()) {
            return "Arrival source unavailable";
        }
        String joined = predictions.stream()
            .map(ArrivalPrediction::source)
            .filter(source -> source != null && !source.isBlank())
            .distinct()
            .collect(java.util.stream.Collectors.joining(" / "));
        return joined.isBlank() ? "Arrival source unavailable" : joined;
    }

    private StationResponses.StationArrivalContextResponse toArrivalContext(
        List<StationResponses.StationImpactResponse> impacts
    ) {
        return impacts.stream()
            .filter(impact -> impact.type().equals("active-alert") || impact.type().equals("planned-closure"))
            .findFirst()
            .map(impact -> new StationResponses.StationArrivalContextResponse(
                true,
                "Schedule may be disrupted",
                impact.title(),
                impact.severity(),
                impact.source()
            ))
            .orElse(new StationResponses.StationArrivalContextResponse(
                false,
                "Schedule active",
                "No active service impacts linked to this station.",
                "normal",
                "LineWatchTO"
            ));
    }

    private StationResponses.StationLineResponse toLineResponse(
        StationLineEntity stationLine,
        TransitLineEntity line
    ) {
        if (line == null) {
            throw new IllegalStateException("Station line references unknown transit line: " + stationLine.getLineId());
        }

        return new StationResponses.StationLineResponse(
            line.getId(),
            line.getNumber(),
            line.getName(),
            line.getColor(),
            stationLine.getPlatformLabel(),
            stationLine.isWheelchairAccessible(),
            stationLine.hasElevator()
        );
    }

    private StationResponses.StationAccessResponse toAccessResponse(StationAccessStatusEntity access) {
        return new StationResponses.StationAccessResponse(
            access.getStatus(),
            access.getSummary(),
            access.getUpdatedAgo(),
            List.of()
        );
    }

    private StationResponses.StationAccessResponse toLiveAccessResponse(
        List<StationLiveReadRepository.FacilityOutage> outages
    ) {
        List<StationResponses.StationFacilityOutageResponse> responses = outages.stream()
            .map(outage -> new StationResponses.StationFacilityOutageResponse(
                outage.id(),
                outage.assetType(),
                outage.title(),
                outage.description(),
                outage.cause(),
                outage.updatedAt(),
                "TTC Live Alerts"
            ))
            .toList();
        String summary = responses.isEmpty()
            ? "No active TTC accessibility outages are linked to this station."
            : responses.size() + " active TTC accessibility "
                + (responses.size() == 1 ? "outage is" : "outages are")
                + " linked to this station.";
        return new StationResponses.StationAccessResponse(
            responses.isEmpty() ? "normal" : "outage",
            summary,
            "TTC Live Alerts",
            responses
        );
    }

    private StationResponses.StationImpactResponse toImpactResponse(StationImpactEntity impact) {
        return new StationResponses.StationImpactResponse(
            impact.getId(),
            impact.getType(),
            impact.getSeverity(),
            impact.getTitle(),
            impact.getSummary(),
            impact.getUpdatedAgo(),
            null,
            impact.getSource()
        );
    }

    private StationResponses.StationImpactResponse toImpactResponse(
        StationLiveReadRepository.LinkedAlert alert,
        String plannedClosureTitle
    ) {
        return new StationResponses.StationImpactResponse(
            alert.id(),
            alert.type(),
            alert.severity(),
            plannedClosureTitle == null ? alert.title() : plannedClosureTitle,
            alert.description(),
            null,
            alert.updatedAt(),
            alertSourceLabel(alert.sourceAlertType())
        );
    }

    private String alertSourceLabel(String sourceAlertType) {
        return "GTFS-RT".equalsIgnoreCase(sourceAlertType)
            ? "TTC GTFS-RT"
            : "TTC Live Alerts";
    }

    private List<StationResponses.StationImpactResponse> toLiveImpactResponses(String stationId) {
        List<StationLiveReadRepository.LinkedAlert> alerts = liveReadRepository.findActiveAlertsByStationId(stationId);
        Map<String, String> plannedClosureTitlesById = alerts.stream().anyMatch(this::isPlannedClosure)
            ? alertDashboardService.dashboardVisiblePlannedClosureTitlesById()
            : Map.of();
        return toDistinctLiveImpactResponses(alerts, plannedClosureTitlesById);
    }

    private List<StationResponses.StationImpactResponse> toDistinctLiveImpactResponses(
        List<StationLiveReadRepository.LinkedAlert> alerts,
        Map<String, String> plannedClosureTitlesById
    ) {
        Map<String, StationResponses.StationImpactResponse> impactsByIdentity = new LinkedHashMap<>();
        for (StationLiveReadRepository.LinkedAlert alert : alerts) {
            if (isPlannedClosure(alert) && !plannedClosureTitlesById.containsKey(alert.id())) {
                continue;
            }
            StationResponses.StationImpactResponse response = toImpactResponse(
                alert,
                plannedClosureTitlesById.get(alert.id())
            );
            impactsByIdentity.putIfAbsent(stationImpactIdentity(response), response);
        }
        return List.copyOf(impactsByIdentity.values());
    }

    private boolean isPlannedClosure(StationLiveReadRepository.LinkedAlert alert) {
        return "planned-closure".equals(alert.type());
    }

    private String stationImpactIdentity(StationResponses.StationImpactResponse impact) {
        if (impact.type().equals("planned-closure")) {
            String title = normalizedImpactText(impact.title());
            String fallbackSummary = normalizedImpactText(impact.summary());
            return "planned-closure|"
                + normalizedImpactText(impact.severity())
                + "|"
                + (title.isBlank() ? fallbackSummary : title);
        }
        return "source-alert|" + impact.id();
    }

    private String normalizedImpactText(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private Map<String, String> statuses(Set<String> stationIds, String status) {
        return stationIds.stream().collect(Collectors.toMap(Function.identity(), ignored -> status));
    }

    private Map<String, Boolean> flags(Set<String> stationIds) {
        return stationIds.stream().collect(Collectors.toMap(Function.identity(), ignored -> true));
    }

    private Map<String, StationResponses.StationAccessOutageCountsResponse> accessOutageCounts(
        List<StationLiveReadRepository.FacilityOutageCount> outageCounts
    ) {
        Map<String, int[]> countsByStation = new HashMap<>();
        for (StationLiveReadRepository.FacilityOutageCount outageCount : outageCounts) {
            int[] counts = countsByStation.computeIfAbsent(outageCount.stationId(), ignored -> new int[2]);
            if (outageCount.assetType().equals("elevator")) {
                counts[0] = outageCount.count();
            } else if (outageCount.assetType().equals("escalator")) {
                counts[1] = outageCount.count();
            }
        }

        return countsByStation.entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                entry -> new StationResponses.StationAccessOutageCountsResponse(entry.getValue()[0], entry.getValue()[1])
            ));
    }
}
