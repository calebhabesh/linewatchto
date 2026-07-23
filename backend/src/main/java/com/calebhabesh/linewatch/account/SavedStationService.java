package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.station.StationRepository;
import com.calebhabesh.linewatch.station.StationResponses;
import com.calebhabesh.linewatch.station.StationService;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedStationService {
    private static final int MAX_STATION_ID_LENGTH = 80;

    private final SavedStationRepository savedStationRepository;
    private final StationRepository stationRepository;
    private final StationService stationService;
    private final Clock clock;

    public SavedStationService(
        SavedStationRepository savedStationRepository,
        StationRepository stationRepository,
        StationService stationService,
        Clock clock
    ) {
        this.savedStationRepository = savedStationRepository;
        this.stationRepository = stationRepository;
        this.stationService = stationService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SavedStationResponses.SavedStationListResponse list(AccountEntity account) {
        List<SavedStationEntity> savedStations =
            savedStationRepository.findByAccountIdOrderByCreatedAtDesc(account.getId());
        Map<String, StationResponses.StationSummaryResponse> summariesById = stationSummariesById();

        List<SavedStationResponses.SavedStationResponse> responses = savedStations.stream()
            .map(saved -> new SavedStationResponses.SavedStationResponse(
                requireSummary(summariesById, saved.getStationId()),
                saved.getCreatedAt()
            ))
            .toList();
        return new SavedStationResponses.SavedStationListResponse(responses);
    }

    @Transactional
    public SavedStationResponses.SaveResult save(AccountEntity account, String rawStationId) {
        String stationId = validateStationId(rawStationId);
        if (!stationRepository.existsById(stationId)) {
            throw new AccountException(HttpStatus.NOT_FOUND, "unknown_station", "Station was not found.");
        }

        Instant now = clock.instant();
        boolean created = savedStationRepository.insertIfAbsent(account.getId(), stationId, now) > 0;
        SavedStationEntity saved = savedStationRepository
            .findByAccountIdAndStationId(account.getId(), stationId)
            .orElseThrow(() -> new IllegalStateException("Saved station insert did not produce a readable row."));
        StationResponses.StationSummaryResponse summary = requireSummary(stationSummariesById(), stationId);

        return new SavedStationResponses.SaveResult(
            new SavedStationResponses.SavedStationResponse(summary, saved.getCreatedAt()),
            created
        );
    }

    @Transactional
    public void delete(AccountEntity account, String rawStationId) {
        String stationId = validateStationId(rawStationId);
        savedStationRepository.deleteByAccountIdAndStationId(account.getId(), stationId);
    }

    private Map<String, StationResponses.StationSummaryResponse> stationSummariesById() {
        return stationService.stationSummaries().stations().stream()
            .collect(Collectors.toMap(StationResponses.StationSummaryResponse::id, Function.identity()));
    }

    private StationResponses.StationSummaryResponse requireSummary(
        Map<String, StationResponses.StationSummaryResponse> summariesById,
        String stationId
    ) {
        StationResponses.StationSummaryResponse summary = summariesById.get(stationId);
        if (summary == null) {
            throw new IllegalStateException("Saved station references an unavailable station: " + stationId);
        }
        return summary;
    }

    private String validateStationId(String rawStationId) {
        String stationId = rawStationId == null ? "" : rawStationId.trim();
        if (stationId.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_station", "Choose a station.");
        }
        if (stationId.length() > MAX_STATION_ID_LENGTH) {
            throw new AccountException(
                HttpStatus.BAD_REQUEST,
                "invalid_station",
                "Station id must be 80 characters or less."
            );
        }
        return stationId;
    }
}
