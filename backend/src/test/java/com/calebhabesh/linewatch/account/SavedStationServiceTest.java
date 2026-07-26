package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationRepository;
import com.calebhabesh.linewatch.station.StationResponses;
import com.calebhabesh.linewatch.station.StationService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class SavedStationServiceTest {
    private final SavedStationRepository savedStationRepository = mock(SavedStationRepository.class);
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final StationService stationService = mock(StationService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-23T14:30:00Z"), ZoneOffset.UTC);
    private final SavedStationService service = new SavedStationService(
        savedStationRepository,
        stationRepository,
        stationService,
        clock
    );
    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-07-23T14:00:00Z")
    );

    @Test
    void listsOnlyCurrentAccountStationsWithFreshSummaryShape() {
        SavedStationEntity saved = savedStation("user_1", "sheppard-yonge", "2026-07-23T14:20:00Z");
        when(savedStationRepository.findByAccountIdOrderByCreatedAtDesc("user_1")).thenReturn(List.of(saved));
        stubSummaries(summary("sheppard-yonge", true, "outage"));

        SavedStationResponses.SavedStationListResponse response = service.list(account);

        assertThat(response.stations()).singleElement().satisfies(item -> {
            assertThat(item.station().id()).isEqualTo("sheppard-yonge");
            assertThat(item.networkId()).isEqualTo("ttc");
            assertThat(item.station().hasActiveImpact()).isTrue();
            assertThat(item.station().accessStatus()).isEqualTo("outage");
            assertThat(item.savedAt()).isEqualTo(Instant.parse("2026-07-23T14:20:00Z"));
        });
        verify(savedStationRepository).findByAccountIdOrderByCreatedAtDesc("user_1");
    }

    @Test
    void savesKnownStationIdempotently() {
        SavedStationEntity saved = savedStation("user_1", "union", "2026-07-23T14:30:00Z");
        when(stationRepository.existsById("union")).thenReturn(true);
        when(savedStationRepository.insertIfAbsent("user_1", "ttc", "union", clock.instant())).thenReturn(1);
        when(savedStationRepository.findByAccountIdAndNetworkIdAndStationId("user_1", "ttc", "union")).thenReturn(Optional.of(saved));
        stubSummaries(summary("union", false, "normal"));

        SavedStationResponses.SaveResult first = service.save(account, "ttc", " union ");

        assertThat(first.created()).isTrue();
        assertThat(first.station().station().name()).isEqualTo("Union");

        when(savedStationRepository.insertIfAbsent("user_1", "ttc", "union", clock.instant())).thenReturn(0);
        SavedStationResponses.SaveResult duplicate = service.save(account, "ttc", "union");

        assertThat(duplicate.created()).isFalse();
        assertThat(duplicate.station().savedAt()).isEqualTo(clock.instant());
    }

    @Test
    void rejectsUnknownAndOverlongStationsBeforeInsert() {
        when(stationRepository.existsById("not-a-station")).thenReturn(false);

        assertThatThrownBy(() -> service.save(account, "ttc", "not-a-station"))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.NOT_FOUND);

        assertThatThrownBy(() -> service.save(account, "ttc", "a".repeat(81)))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("80 characters or less");
        verify(savedStationRepository, never()).insertIfAbsent("user_1", "ttc", "not-a-station", clock.instant());
    }

    @Test
    void savesRegionalStationsWithoutCollidingWithTtcIds() {
        SavedStationEntity saved = savedStation("user_1", "union", "2026-07-23T14:30:00Z");
        when(saved.getNetworkId()).thenReturn("regional");
        when(savedStationRepository.insertIfAbsent("user_1", "regional", "union", clock.instant())).thenReturn(1);
        when(savedStationRepository.findByAccountIdAndNetworkIdAndStationId("user_1", "regional", "union"))
            .thenReturn(Optional.of(saved));

        SavedStationResponses.SaveResult result = service.save(account, "regional", "union");

        assertThat(result.station().networkId()).isEqualTo("regional");
        assertThat(result.station().station().lineIds()).contains("regional-br", "regional-up");
        verify(stationRepository, never()).existsById("union");
    }

    @Test
    void deleteIsAccountScopedAndIdempotent() {
        service.delete(account, "ttc", "union");
        service.delete(account, "ttc", "union");

        verify(savedStationRepository, org.mockito.Mockito.times(2))
            .deleteByAccountIdAndNetworkIdAndStationId("user_1", "ttc", "union");
    }

    private SavedStationEntity savedStation(String accountId, String stationId, String createdAt) {
        SavedStationEntity saved = mock(SavedStationEntity.class);
        when(saved.getAccountId()).thenReturn(accountId);
        when(saved.getNetworkId()).thenReturn("ttc");
        when(saved.getStationId()).thenReturn(stationId);
        when(saved.getCreatedAt()).thenReturn(Instant.parse(createdAt));
        return saved;
    }

    private void stubSummaries(StationResponses.StationSummaryResponse... summaries) {
        when(stationService.stationSummaries()).thenReturn(
            new StationResponses.StationListResponse("seeded-demo", List.of(summaries))
        );
    }

    private StationResponses.StationSummaryResponse summary(String id, boolean activeImpact, String accessStatus) {
        String name = id.equals("union") ? "Union" : "Sheppard-Yonge";
        return new StationResponses.StationSummaryResponse(
            id,
            name,
            100,
            200,
            id.equals("sheppard-yonge"),
            id.equals("sheppard-yonge") ? List.of("line-1", "line-4") : List.of("line-1"),
            activeImpact,
            accessStatus,
            new StationResponses.StationAccessOutageCountsResponse(accessStatus.equals("outage") ? 1 : 0, 0)
        );
    }
}
