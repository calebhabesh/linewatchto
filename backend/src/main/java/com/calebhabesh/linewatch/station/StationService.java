package com.calebhabesh.linewatch.station;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

@Service
public class StationService {
    private static final String DATA_MODE = "seeded-demo";
    private static final String DISCLAIMER =
        "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions.";

    private final StationRepository stationRepository;
    private final TransitLineRepository transitLineRepository;
    private final StationLineRepository stationLineRepository;
    private final StationAccessStatusRepository accessStatusRepository;
    private final StationImpactRepository impactRepository;

    public StationService(
        StationRepository stationRepository,
        TransitLineRepository transitLineRepository,
        StationLineRepository stationLineRepository,
        StationAccessStatusRepository accessStatusRepository,
        StationImpactRepository impactRepository
    ) {
        this.stationRepository = stationRepository;
        this.transitLineRepository = transitLineRepository;
        this.stationLineRepository = stationLineRepository;
        this.accessStatusRepository = accessStatusRepository;
        this.impactRepository = impactRepository;
    }

    public StationResponses.StationListResponse stationSummaries() {
        List<StationEntity> stations = stationRepository.findAllByOrderBySortOrderAscNameAsc();
        Map<String, List<String>> lineIdsByStation = stationLineRepository.findAllByOrderByStationIdAscSortOrderAsc()
            .stream()
            .collect(Collectors.groupingBy(
                StationLineEntity::getStationId,
                Collectors.mapping(StationLineEntity::getLineId, Collectors.toList())
            ));
        Map<String, String> accessByStation = accessStatusRepository.findAll()
            .stream()
            .collect(Collectors.toMap(StationAccessStatusEntity::getStationId, StationAccessStatusEntity::getStatus));
        Map<String, Boolean> activeImpactByStation = impactRepository.findAll()
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
                accessByStation.getOrDefault(station.getId(), "normal")
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

        StationResponses.StationAccessResponse access = accessStatusRepository.findById(id)
            .map(this::toAccessResponse)
            .orElse(new StationResponses.StationAccessResponse(
                "normal",
                "No station access advisories in demo data.",
                "Fixture seed"
            ));

        List<StationResponses.StationImpactResponse> impacts = impactRepository.findByStationIdOrderBySortOrderAsc(id)
            .stream()
            .map(this::toImpactResponse)
            .toList();

        List<StationResponses.StationArrivalResponse> arrivals = lines.stream()
            .flatMap(line -> List.of(
                new StationResponses.StationArrivalResponse(line.id(), "Northbound / Eastbound", 2, "Demo arrival"),
                new StationResponses.StationArrivalResponse(line.id(), "Southbound / Westbound", 5, "Demo arrival")
            ).stream())
            .toList();

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
            DATA_MODE,
            DISCLAIMER
        );
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
            stationLine.getPlatformLabel()
        );
    }

    private StationResponses.StationAccessResponse toAccessResponse(StationAccessStatusEntity access) {
        return new StationResponses.StationAccessResponse(
            access.getStatus(),
            access.getSummary(),
            access.getUpdatedAgo()
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
            impact.getSource()
        );
    }
}
