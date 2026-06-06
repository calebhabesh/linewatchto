package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class SavedCommuteServiceTest {
    private final SavedCommuteRepository commuteRepository = mock(SavedCommuteRepository.class);
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final CommutePathService commutePathService = mock(CommutePathService.class);
    private final CommuteImpactService commuteImpactService = mock(CommuteImpactService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T14:30:00Z"), ZoneOffset.UTC);
    private final SavedCommuteService service = new SavedCommuteService(
        commuteRepository,
        stationRepository,
        commutePathService,
        commuteImpactService,
        clock
    );

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    private void stubCommutePathAndImpact(String originStationId, String destinationStationId) {
        CommuteResponses.PathResponse path = new CommuteResponses.PathResponse(
            "available",
            List.of(originStationId, destinationStationId),
            List.of("segment_" + originStationId + "_" + destinationStationId),
            List.of("line-1"),
            List.of(),
            300,
            "gtfs-scheduled-median",
            "Default scheduled route: 2 stations on Line 1, about 5 min"
        );
        when(commutePathService.path(originStationId, destinationStationId)).thenReturn(path);
        when(commuteImpactService.impactFor(path)).thenReturn(new CommuteResponses.ImpactResponse(
            "clear",
            "clear",
            "Clear",
            "No active or planned LineWatch impacts match this route.",
            List.of()
        ));
    }

    @Test
    void createsSavedCommuteWithResolvedStationNames() {
        StationEntity finch = new StationEntity("finch", "Finch", 0, 0, false, 10, null);
        StationEntity union = new StationEntity("union", "Union", 0, 0, true, 20, null);
        when(stationRepository.findById("finch")).thenReturn(Optional.of(finch));
        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_1", "finch", "union")).thenReturn(false);
        when(commuteRepository.save(any(SavedCommuteEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubCommutePathAndImpact("finch", "union");

        AccountResponses.SavedCommuteResponse response = service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("Morning commute", "finch", "union")
        );

        assertThat(response.label()).isEqualTo("Morning commute");
        assertThat(response.originStationName()).isEqualTo("Finch");
        assertThat(response.destinationStationName()).isEqualTo("Union");
        assertThat(response.routeLabel()).isEqualTo("Finch -> Union");
        assertThat(response.path().estimatedTravelSeconds()).isEqualTo(300);
        assertThat(response.path().weightSource()).isEqualTo("gtfs-scheduled-median");
        assertThat(response.impact().statusLabel()).isEqualTo("Clear");
    }

    @Test
    void rejectsSameOriginAndDestination() {
        assertThatThrownBy(() -> service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("Loop", "union", "union")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void listsCommutesForCurrentAccountOnly() {
        StationEntity finch = new StationEntity("finch", "Finch", 0, 0, false, 10, null);
        StationEntity union = new StationEntity("union", "Union", 0, 0, true, 20, null);
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            Instant.parse("2026-06-05T14:30:00Z")
        );
        when(commuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(stationRepository.findAllById(List.of("finch", "union"))).thenReturn(List.of(finch, union));
        stubCommutePathAndImpact("finch", "union");

        AccountResponses.SavedCommuteListResponse response = service.list(account);

        assertThat(response.commutes()).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo("commute_1");
            assertThat(item.routeLabel()).isEqualTo("Finch -> Union");
            assertThat(item.path().estimatedTravelSeconds()).isEqualTo(300);
            assertThat(item.path().weightSource()).isEqualTo("gtfs-scheduled-median");
            assertThat(item.impact().statusLabel()).isEqualTo("Clear");
        });
    }
}
