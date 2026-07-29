package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import com.calebhabesh.linewatch.regional.RegionalCommuteImpactService;
import com.calebhabesh.linewatch.regional.RegionalCommutePathService;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedCommuteService {
    private static final int MAX_LABEL_LENGTH = 120;
    private static final int MAX_STATION_ID_LENGTH = 80;
    private static final int ALL_DAYS_MASK = 127;
    private static final int MAX_DAY_MASK = 127;
    private static final int MINUTE_MIN = 0;
    private static final int MINUTE_MAX = 1439;

    private final SavedCommuteRepository commuteRepository;
    private final StationRepository stationRepository;
    private final CommutePathService commutePathService;
    private final CommuteImpactService commuteImpactService;
    private final RegionalCommutePathService regionalCommutePathService;
    private final RegionalCommuteImpactService regionalCommuteImpactService;
    private final Clock clock;

    @Autowired
    public SavedCommuteService(
        SavedCommuteRepository commuteRepository,
        StationRepository stationRepository,
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        RegionalCommutePathService regionalCommutePathService,
        RegionalCommuteImpactService regionalCommuteImpactService
    ) {
        this(
            commuteRepository, stationRepository, commutePathService, commuteImpactService,
            regionalCommutePathService, regionalCommuteImpactService, Clock.systemUTC()
        );
    }

    SavedCommuteService(
        SavedCommuteRepository commuteRepository,
        StationRepository stationRepository,
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        Clock clock
    ) {
        this(commuteRepository, stationRepository, commutePathService, commuteImpactService, null, null, clock);
    }

    SavedCommuteService(
        SavedCommuteRepository commuteRepository,
        StationRepository stationRepository,
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        RegionalCommutePathService regionalCommutePathService,
        RegionalCommuteImpactService regionalCommuteImpactService,
        Clock clock
    ) {
        this.commuteRepository = commuteRepository;
        this.stationRepository = stationRepository;
        this.commutePathService = commutePathService;
        this.commuteImpactService = commuteImpactService;
        this.regionalCommutePathService = regionalCommutePathService;
        this.regionalCommuteImpactService = regionalCommuteImpactService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AccountResponses.SavedCommuteListResponse list(AccountEntity account) {
        List<SavedCommuteEntity> commutes = commuteRepository.findByAccountIdOrderByCreatedAtAsc(account.getId());
        List<String> stationIds = commutes.stream()
            .filter(commute -> "ttc".equals(commute.getNetworkId()))
            .flatMap(commute -> List.of(commute.getOriginStationId(), commute.getDestinationStationId()).stream())
            .distinct()
            .toList();
        Map<String, String> stationNamesByKey = stationRepository.findAllById(stationIds)
            .stream()
            .collect(Collectors.toMap(station -> stationKey("ttc", station.getId()), StationEntity::getName));
        commutes.stream()
            .filter(commute -> "regional".equals(commute.getNetworkId()))
            .flatMap(commute -> List.of(commute.getOriginStationId(), commute.getDestinationStationId()).stream())
            .distinct()
            .forEach(stationId -> RegionalNetworkCatalog.station(stationId).ifPresent(station ->
                stationNamesByKey.put(stationKey("regional", stationId), station.name())
            ));
        return new AccountResponses.SavedCommuteListResponse(
            commutes.stream()
                .map(commute -> toResponse(commute, stationNamesByKey))
                .toList()
        );
    }

    @Transactional
    public AccountResponses.SavedCommuteResponse create(AccountEntity account, CreateSavedCommuteRequest request) {
        String originId = normalizeStationId(request.originStationId());
        String destinationId = normalizeStationId(request.destinationStationId());
        String networkId = normalizeNetworkId(request.networkId());
        validateLabelLength(request.label());
        if (originId.equals(destinationId)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "same_station", "Choose two different stations for this commute.");
        }
        String originName = stationName(networkId, originId, "unknown_origin_station", "Origin station is not mapped.");
        String destinationName = stationName(networkId, destinationId, "unknown_destination_station", "Destination station is not mapped.");
        if (commuteRepository.existsByAccountIdAndNetworkIdAndOriginStationIdAndDestinationStationId(account.getId(), networkId, originId, destinationId)) {
            throw new AccountException(HttpStatus.CONFLICT, "commute_exists", "That commute is already saved.");
        }

        Instant now = clock.instant();
        String label = normalizeLabel(request.label(), originName, destinationName);
        boolean watchReturnTrip = request.watchReturnTrip() == null || request.watchReturnTrip();
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            nextId(),
            account,
            label,
            networkId,
            originId,
            destinationId,
            watchReturnTrip,
            now
        );
        applyNotificationRule(commute, request.notificationRule(), now);
        commute = commuteRepository.save(commute);
        return toResponse(commute, Map.of(
            stationKey(networkId, originId), originName,
            stationKey(networkId, destinationId), destinationName
        ));
    }

    @Transactional
    public AccountResponses.SavedCommuteResponse updateRoute(
        AccountEntity account,
        String commuteId,
        UpdateSavedCommuteRequest request
    ) {
        SavedCommuteEntity commute = commuteRepository.findByIdAndAccountId(commuteId, account.getId())
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "commute_not_found", "Commute was not found."));
        String originId = normalizeStationId(request.originStationId());
        String destinationId = normalizeStationId(request.destinationStationId());
        if (originId.equals(destinationId)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "same_station", "Choose two different stations for this commute.");
        }
        String networkId = commute.getNetworkId();
        String originName = stationName(networkId, originId, "unknown_origin_station", "Origin station is not mapped.");
        String destinationName = stationName(networkId, destinationId, "unknown_destination_station", "Destination station is not mapped.");
        boolean duplicate = (!originId.equals(commute.getOriginStationId()) || !destinationId.equals(commute.getDestinationStationId()))
            && commuteRepository.existsByAccountIdAndNetworkIdAndOriginStationIdAndDestinationStationId(
                account.getId(), networkId, originId, destinationId
            );
        if (duplicate) {
            throw new AccountException(HttpStatus.CONFLICT, "commute_exists", "That commute is already saved.");
        }
        String label = normalizeLabel(request.label(), originName, destinationName);
        boolean watchReturnTrip = request.watchReturnTrip() == null ? commute.isWatchReturnTrip() : request.watchReturnTrip();
        commute.updateRoute(label, originId, destinationId, watchReturnTrip, clock.instant());
        commute = commuteRepository.save(commute);
        return toResponse(commute, Map.of(
            stationKey(networkId, originId), originName,
            stationKey(networkId, destinationId), destinationName
        ));
    }

    @Transactional
    public AccountResponses.SavedCommuteResponse updateNotificationRule(
        AccountEntity account,
        String commuteId,
        SavedCommuteNotificationRuleRequest request
    ) {
        SavedCommuteEntity commute = commuteRepository.findByIdAndAccountId(commuteId, account.getId())
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "commute_not_found", "Commute was not found."));
        applyNotificationRule(commute, request, clock.instant());
        commute = commuteRepository.save(commute);

        Map<String, String> stationsById;
        if ("regional".equals(commute.getNetworkId())) {
            stationsById = List.of(commute.getOriginStationId(), commute.getDestinationStationId()).stream()
                .collect(Collectors.toMap(
                    stationId -> stationKey("regional", stationId),
                    stationId -> RegionalNetworkCatalog.station(stationId)
                        .map(StationResponses.StationSummaryResponse::name)
                        .orElse(stationId)
                ));
        } else {
            List<String> stationIds = List.of(commute.getOriginStationId(), commute.getDestinationStationId());
            stationsById = stationRepository.findAllById(stationIds)
                .stream()
                .collect(Collectors.toMap(station -> stationKey("ttc", station.getId()), StationEntity::getName));
        }
        return toResponse(commute, stationsById);
    }

    @Transactional
    public void delete(AccountEntity account, String commuteId) {
        SavedCommuteEntity commute = commuteRepository.findByIdAndAccountId(commuteId, account.getId())
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "commute_not_found", "Commute was not found."));
        commuteRepository.delete(commute);
    }

    private AccountResponses.SavedCommuteResponse toResponse(SavedCommuteEntity commute, Map<String, String> stationsById) {
        String networkId = commute.getNetworkId();
        String originName = stationsById.getOrDefault(stationKey(networkId, commute.getOriginStationId()), commute.getOriginStationId());
        String destinationName = stationsById.getOrDefault(stationKey(networkId, commute.getDestinationStationId()), commute.getDestinationStationId());
        CommuteResponses.CommuteLegResponse outboundLeg = legResponse(
            commute,
            "outbound",
            commute.getOriginStationId(),
            originName,
            commute.getDestinationStationId(),
            destinationName
        );
        CommuteResponses.CommuteLegResponse returnLeg = commute.isWatchReturnTrip()
            ? legResponse(
                commute,
                "return",
                commute.getDestinationStationId(),
                destinationName,
                commute.getOriginStationId(),
                originName
            )
            : null;
        return new AccountResponses.SavedCommuteResponse(
            commute.getId(),
            commute.getLabel(),
            networkId,
            commute.getOriginStationId(),
            originName,
            commute.getDestinationStationId(),
            destinationName,
            originName + " -> " + destinationName,
            commute.isWatchReturnTrip(),
            outboundLeg,
            returnLeg,
            outboundLeg.path(),
            outboundLeg.impact(),
            notificationRuleResponse(commute),
            commute.getCreatedAt(),
            commute.getUpdatedAt()
        );
    }

    private CommuteResponses.CommuteLegResponse legResponse(
        SavedCommuteEntity commute,
        String id,
        String fromStationId,
        String fromStationName,
        String toStationId,
        String toStationName
    ) {
        CommuteResponses.PathResponse path = "regional".equals(commute.getNetworkId())
            ? requireRegionalPathService().path(fromStationId, toStationId)
            : commutePathService.path(fromStationId, toStationId);
        CommuteResponses.ImpactResponse impact = "regional".equals(commute.getNetworkId())
            ? requireRegionalImpactService().impactFor(path)
            : filteredImpactFor(commute, id, path);
        return new CommuteResponses.CommuteLegResponse(
            id,
            fromStationName + " -> " + toStationName,
            fromStationId,
            fromStationName,
            toStationId,
            toStationName,
            path,
            impact
        );
    }

    private CommuteResponses.ImpactResponse filteredImpactFor(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.PathResponse path
    ) {
        CommuteResponses.ImpactResponse impact = commuteImpactService.impactFor(path);
        if (impact == null || impact.matchedImpacts() == null || impact.matchedImpacts().isEmpty()) {
            return impact;
        }
        List<CommuteResponses.MatchedImpactResponse> annotatedMatches = impact.matchedImpacts().stream()
            .map(match -> match.withIgnoredByRule(!SavedCommuteAlertRules.dashboardMatchCounts(commute, legId, match)))
            .toList();
        return commuteImpactService.responseForMatches(path, annotatedMatches);
    }

    private String normalizeLabel(String label, String originName, String destinationName) {
        String normalized = label == null ? "" : label.trim();
        validateLabelLength(normalized);
        return normalized.isBlank() ? originName + " to " + destinationName : normalized;
    }

    private void validateLabelLength(String label) {
        String normalized = label == null ? "" : label.trim();
        if (normalized.length() > MAX_LABEL_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_commute_label", "Commute label must be 120 characters or less.");
        }
    }

    private String normalizeStationId(String stationId) {
        if (stationId == null || stationId.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "missing_station", "Choose an origin and destination station.");
        }
        String normalized = stationId.trim();
        if (normalized.length() > MAX_STATION_ID_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_station", "Station id must be 80 characters or less.");
        }
        return normalized;
    }

    private String normalizeNetworkId(String networkId) {
        String normalized = networkId == null || networkId.isBlank() ? "ttc" : networkId.trim().toLowerCase(java.util.Locale.CANADA);
        if (!"ttc".equals(normalized) && !"regional".equals(normalized)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_network", "Choose TTC or GO/UP for this commute.");
        }
        return normalized;
    }

    private String stationName(String networkId, String stationId, String error, String message) {
        if ("regional".equals(networkId)) {
            return RegionalNetworkCatalog.station(stationId).map(station -> station.name())
                .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, error, message));
        }
        return stationRepository.findById(stationId).map(StationEntity::getName)
            .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, error, message));
    }

    private String stationKey(String networkId, String stationId) {
        return networkId + ":" + stationId;
    }

    private RegionalCommutePathService requireRegionalPathService() {
        if (regionalCommutePathService == null) throw new IllegalStateException("Regional commute routing is unavailable");
        return regionalCommutePathService;
    }

    private RegionalCommuteImpactService requireRegionalImpactService() {
        if (regionalCommuteImpactService == null) throw new IllegalStateException("Regional commute matching is unavailable");
        return regionalCommuteImpactService;
    }

    private void applyNotificationRule(
        SavedCommuteEntity commute,
        SavedCommuteNotificationRuleRequest request,
        Instant now
    ) {
        if (request == null) {
            return;
        }

        SavedCommuteNotificationScheduleRequest outboundSchedule = request.outboundSchedule();
        SavedCommuteNotificationScheduleRequest returnSchedule = request.returnSchedule();
        int legacyDayMask = validateDayMask(valueOrDefault(request.dayMask(), commute.getNotificationOutboundDayMask()));
        Integer legacyStartMinute = request.startMinute();
        Integer legacyEndMinute = request.endMinute();
        validateTimeWindow(legacyStartMinute, legacyEndMinute);

        int outboundDayMask = outboundSchedule == null
            ? legacyDayMask
            : validateDayMask(valueOrDefault(outboundSchedule.dayMask(), commute.getNotificationOutboundDayMask()));
        Integer outboundStartMinute = outboundSchedule == null ? legacyStartMinute : outboundSchedule.startMinute();
        Integer outboundEndMinute = outboundSchedule == null ? legacyEndMinute : outboundSchedule.endMinute();
        validateTimeWindow(outboundStartMinute, outboundEndMinute);

        int returnDayMask = returnSchedule == null
            ? legacyDayMask
            : validateDayMask(valueOrDefault(returnSchedule.dayMask(), commute.getNotificationReturnDayMask()));
        Integer returnStartMinute = returnSchedule == null ? legacyStartMinute : returnSchedule.startMinute();
        Integer returnEndMinute = returnSchedule == null ? legacyEndMinute : returnSchedule.endMinute();
        validateTimeWindow(returnStartMinute, returnEndMinute);

        SavedCommuteNotificationEventTypesRequest eventTypes = request.eventTypes();
        commute.updateNotificationRule(
            valueOrDefault(request.enabled(), commute.isNotificationEnabled()),
            outboundDayMask,
            outboundStartMinute,
            outboundEndMinute,
            returnDayMask,
            returnStartMinute,
            returnEndMinute,
            valueOrDefault(request.outboundEnabled(), commute.isNotificationOutboundEnabled()),
            valueOrDefault(request.returnEnabled(), commute.isNotificationReturnEnabled()),
            eventTypes == null ? commute.isNotificationSuspensionEnabled() : valueOrDefault(eventTypes.suspensions(), commute.isNotificationSuspensionEnabled()),
            eventTypes == null ? commute.isNotificationDelayEnabled() : valueOrDefault(eventTypes.delays(), commute.isNotificationDelayEnabled()),
            eventTypes == null ? commute.isNotificationReducedSpeedZoneEnabled() : valueOrDefault(eventTypes.reducedSpeedZones(), commute.isNotificationReducedSpeedZoneEnabled()),
            eventTypes == null ? commute.isNotificationPlannedClosureEnabled() : valueOrDefault(eventTypes.plannedClosures(), commute.isNotificationPlannedClosureEnabled()),
            eventTypes == null ? commute.isNotificationRestoredEnabled() : valueOrDefault(eventTypes.serviceRestored(), commute.isNotificationRestoredEnabled()),
            now
        );
    }

    private AccountResponses.SavedCommuteNotificationRuleResponse notificationRuleResponse(SavedCommuteEntity commute) {
        return new AccountResponses.SavedCommuteNotificationRuleResponse(
            commute.isNotificationEnabled(),
            commute.getNotificationOutboundDayMask(),
            commute.getNotificationOutboundStartMinute(),
            commute.getNotificationOutboundEndMinute(),
            commute.isNotificationOutboundEnabled(),
            commute.isNotificationReturnEnabled(),
            new AccountResponses.SavedCommuteNotificationEventTypesResponse(
                commute.isNotificationSuspensionEnabled(),
                commute.isNotificationDelayEnabled(),
                commute.isNotificationReducedSpeedZoneEnabled(),
                commute.isNotificationPlannedClosureEnabled(),
                commute.isNotificationRestoredEnabled()
            ),
            new AccountResponses.SavedCommuteNotificationScheduleResponse(
                commute.getNotificationOutboundDayMask(),
                commute.getNotificationOutboundStartMinute(),
                commute.getNotificationOutboundEndMinute()
            ),
            new AccountResponses.SavedCommuteNotificationScheduleResponse(
                commute.getNotificationReturnDayMask(),
                commute.getNotificationReturnStartMinute(),
                commute.getNotificationReturnEndMinute()
            )
        );
    }

    private int validateDayMask(Integer dayMask) {
        int normalized = dayMask == null ? ALL_DAYS_MASK : dayMask;
        if (normalized < 0 || normalized > MAX_DAY_MASK) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_notification_days", "Notification days must be between 0 and 127.");
        }
        return normalized;
    }

    private void validateTimeWindow(Integer startMinute, Integer endMinute) {
        if (startMinute == null && endMinute == null) {
            return;
        }
        if (startMinute == null || endMinute == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_notification_window", "Notification start and end time must both be set or both be blank.");
        }
        if (startMinute < MINUTE_MIN || startMinute > MINUTE_MAX || endMinute < MINUTE_MIN || endMinute > MINUTE_MAX) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_notification_window", "Notification times must be between 0 and 1439 minutes.");
        }
        if (startMinute.equals(endMinute)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_notification_window", "Notification start and end time must be different.");
        }
    }

    private boolean valueOrDefault(Boolean value, boolean fallback) {
        return value == null ? fallback : value;
    }

    private int valueOrDefault(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private String nextId() {
        return "commute_" + UUID.randomUUID().toString().replace("-", "");
    }

    public record CreateSavedCommuteRequest(
        String label,
        String originStationId,
        String destinationStationId,
        Boolean watchReturnTrip,
        SavedCommuteNotificationRuleRequest notificationRule,
        String networkId
    ) {
        public CreateSavedCommuteRequest(
            String label,
            String originStationId,
            String destinationStationId,
            Boolean watchReturnTrip
        ) {
            this(label, originStationId, destinationStationId, watchReturnTrip, null, "ttc");
        }

        public CreateSavedCommuteRequest(
            String label,
            String originStationId,
            String destinationStationId,
            Boolean watchReturnTrip,
            SavedCommuteNotificationRuleRequest notificationRule
        ) {
            this(label, originStationId, destinationStationId, watchReturnTrip, notificationRule, "ttc");
        }
    }

    public record UpdateSavedCommuteRequest(
        String label,
        String originStationId,
        String destinationStationId,
        Boolean watchReturnTrip
    ) {}

    public record SavedCommuteNotificationEventTypesRequest(
        Boolean suspensions,
        Boolean delays,
        Boolean reducedSpeedZones,
        Boolean plannedClosures,
        Boolean serviceRestored
    ) {}

    public record SavedCommuteNotificationScheduleRequest(
        Integer dayMask,
        Integer startMinute,
        Integer endMinute
    ) {}

    public record SavedCommuteNotificationRuleRequest(
        Boolean enabled,
        Integer dayMask,
        Integer startMinute,
        Integer endMinute,
        Boolean outboundEnabled,
        Boolean returnEnabled,
        SavedCommuteNotificationEventTypesRequest eventTypes,
        SavedCommuteNotificationScheduleRequest outboundSchedule,
        SavedCommuteNotificationScheduleRequest returnSchedule
    ) {
        public SavedCommuteNotificationRuleRequest(
            Boolean enabled,
            Integer dayMask,
            Integer startMinute,
            Integer endMinute,
            Boolean outboundEnabled,
            Boolean returnEnabled,
            SavedCommuteNotificationEventTypesRequest eventTypes
        ) {
            this(
                enabled,
                dayMask,
                startMinute,
                endMinute,
                outboundEnabled,
                returnEnabled,
                eventTypes,
                null,
                null
            );
        }
    }
}
