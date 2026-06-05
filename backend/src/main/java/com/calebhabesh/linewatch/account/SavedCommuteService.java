package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedCommuteService {
    private final SavedCommuteRepository commuteRepository;
    private final StationRepository stationRepository;
    private final Clock clock;

    public SavedCommuteService(SavedCommuteRepository commuteRepository, StationRepository stationRepository) {
        this(commuteRepository, stationRepository, Clock.systemUTC());
    }

    SavedCommuteService(SavedCommuteRepository commuteRepository, StationRepository stationRepository, Clock clock) {
        this.commuteRepository = commuteRepository;
        this.stationRepository = stationRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AccountResponses.SavedCommuteListResponse list(AccountEntity account) {
        List<SavedCommuteEntity> commutes = commuteRepository.findByAccountIdOrderByCreatedAtAsc(account.getId());
        List<String> stationIds = commutes.stream()
            .flatMap(commute -> List.of(commute.getOriginStationId(), commute.getDestinationStationId()).stream())
            .distinct()
            .toList();
        Map<String, StationEntity> stationsById = stationRepository.findAllById(stationIds)
            .stream()
            .collect(Collectors.toMap(StationEntity::getId, Function.identity()));
        return new AccountResponses.SavedCommuteListResponse(
            commutes.stream()
                .map(commute -> toResponse(commute, stationsById))
                .toList()
        );
    }

    @Transactional
    public AccountResponses.SavedCommuteResponse create(AccountEntity account, CreateSavedCommuteRequest request) {
        String originId = normalizeStationId(request.originStationId());
        String destinationId = normalizeStationId(request.destinationStationId());
        if (originId.equals(destinationId)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "same_station", "Choose two different stations for a saved commute.");
        }
        StationEntity origin = stationRepository.findById(originId)
            .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, "unknown_origin_station", "Origin station is not mapped."));
        StationEntity destination = stationRepository.findById(destinationId)
            .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, "unknown_destination_station", "Destination station is not mapped."));
        if (commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId(account.getId(), originId, destinationId)) {
            throw new AccountException(HttpStatus.CONFLICT, "commute_exists", "That commute is already saved.");
        }

        Instant now = clock.instant();
        String label = normalizeLabel(request.label(), origin.getName(), destination.getName());
        SavedCommuteEntity commute = commuteRepository.save(SavedCommuteEntity.create(
            nextId(),
            account,
            label,
            originId,
            destinationId,
            now
        ));
        return toResponse(commute, Map.of(originId, origin, destinationId, destination));
    }

    @Transactional
    public void delete(AccountEntity account, String commuteId) {
        SavedCommuteEntity commute = commuteRepository.findByIdAndAccountId(commuteId, account.getId())
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "commute_not_found", "Saved commute was not found."));
        commuteRepository.delete(commute);
    }

    private AccountResponses.SavedCommuteResponse toResponse(SavedCommuteEntity commute, Map<String, StationEntity> stationsById) {
        StationEntity origin = stationsById.get(commute.getOriginStationId());
        StationEntity destination = stationsById.get(commute.getDestinationStationId());
        String originName = origin == null ? commute.getOriginStationId() : origin.getName();
        String destinationName = destination == null ? commute.getDestinationStationId() : destination.getName();
        return new AccountResponses.SavedCommuteResponse(
            commute.getId(),
            commute.getLabel(),
            commute.getOriginStationId(),
            originName,
            commute.getDestinationStationId(),
            destinationName,
            originName + " -> " + destinationName,
            commute.getCreatedAt(),
            commute.getUpdatedAt()
        );
    }

    private String normalizeLabel(String label, String originName, String destinationName) {
        String normalized = label == null ? "" : label.trim();
        return normalized.isBlank() ? originName + " to " + destinationName : normalized;
    }

    private String normalizeStationId(String stationId) {
        if (stationId == null || stationId.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "missing_station", "Choose an origin and destination station.");
        }
        return stationId.trim();
    }

    private String nextId() {
        return "commute_" + UUID.randomUUID().toString().replace("-", "");
    }

    public record CreateSavedCommuteRequest(String label, String originStationId, String destinationStationId) {}
}
