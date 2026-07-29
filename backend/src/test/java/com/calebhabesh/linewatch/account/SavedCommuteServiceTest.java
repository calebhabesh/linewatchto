package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.regional.RegionalCommuteImpactService;
import com.calebhabesh.linewatch.regional.RegionalCommutePathService;
import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
            List.of(),
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

    private CommuteResponses.PathResponse stubPath(String originStationId, String destinationStationId) {
        CommuteResponses.PathResponse path = new CommuteResponses.PathResponse(
            "available",
            List.of(originStationId, destinationStationId),
            List.of("segment_" + originStationId + "_" + destinationStationId),
            List.of(),
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
        return path;
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
            new SavedCommuteService.CreateSavedCommuteRequest("Morning commute", "finch", "union", null)
        );

        assertThat(response.label()).isEqualTo("Morning commute");
        assertThat(response.originStationName()).isEqualTo("Finch");
        assertThat(response.destinationStationName()).isEqualTo("Union");
        assertThat(response.routeLabel()).isEqualTo("Finch -> Union");
        assertThat(response.path().estimatedTravelSeconds()).isEqualTo(300);
        assertThat(response.path().weightSource()).isEqualTo("gtfs-scheduled-median");
        assertThat(response.impact().statusLabel()).isEqualTo("Clear");
        assertThat(response.notificationRule()).satisfies(rule -> {
            assertThat(rule.enabled()).isTrue();
            assertThat(rule.dayMask()).isEqualTo(62);
            assertThat(rule.startMinute()).isEqualTo(390);
            assertThat(rule.endMinute()).isEqualTo(570);
            assertThat(rule.outboundSchedule()).isEqualTo(
                new AccountResponses.SavedCommuteNotificationScheduleResponse(62, 390, 570)
            );
            assertThat(rule.returnSchedule()).isEqualTo(
                new AccountResponses.SavedCommuteNotificationScheduleResponse(62, 900, 1140)
            );
            assertThat(rule.outboundEnabled()).isTrue();
            assertThat(rule.returnEnabled()).isTrue();
            assertThat(rule.eventTypes().suspensions()).isTrue();
            assertThat(rule.eventTypes().delays()).isTrue();
            assertThat(rule.eventTypes().reducedSpeedZones()).isTrue();
            assertThat(rule.eventTypes().plannedClosures()).isTrue();
            assertThat(rule.eventTypes().serviceRestored()).isTrue();
        });
    }

    @Test
    void createsSavedCommuteWithGranularNotificationRule() {
        StationEntity queen = new StationEntity("queen", "Queen", 0, 0, false, 10, null);
        StationEntity bloorYonge = new StationEntity("bloor-yonge", "Bloor-Yonge", 0, 0, true, 20, null);
        when(stationRepository.findById("queen")).thenReturn(Optional.of(queen));
        when(stationRepository.findById("bloor-yonge")).thenReturn(Optional.of(bloorYonge));
        when(commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_1", "queen", "bloor-yonge")).thenReturn(false);
        when(commuteRepository.save(any(SavedCommuteEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubPath("queen", "bloor-yonge");

        AccountResponses.SavedCommuteResponse response = service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest(
                "Evening commute",
                "queen",
                "bloor-yonge",
                false,
                new SavedCommuteService.SavedCommuteNotificationRuleRequest(
                    true,
                    62,
                    16 * 60 + 30,
                    17 * 60 + 30,
                    true,
                    false,
                    new SavedCommuteService.SavedCommuteNotificationEventTypesRequest(
                        true,
                        true,
                        false,
                        false,
                        true
                    )
                )
            )
        );

        assertThat(response.notificationRule()).satisfies(rule -> {
            assertThat(rule.enabled()).isTrue();
            assertThat(rule.dayMask()).isEqualTo(62);
            assertThat(rule.startMinute()).isEqualTo(990);
            assertThat(rule.endMinute()).isEqualTo(1050);
            assertThat(rule.outboundEnabled()).isTrue();
            assertThat(rule.returnEnabled()).isFalse();
            assertThat(rule.eventTypes().reducedSpeedZones()).isFalse();
            assertThat(rule.eventTypes().plannedClosures()).isFalse();
        });
        ArgumentCaptor<SavedCommuteEntity> savedCommute = ArgumentCaptor.forClass(SavedCommuteEntity.class);
        verify(commuteRepository).save(savedCommute.capture());
        assertThat(savedCommute.getValue().getNotificationDayMask()).isEqualTo(62);
        assertThat(savedCommute.getValue().getNotificationStartMinute()).isEqualTo(990);
        assertThat(savedCommute.getValue().isNotificationReducedSpeedZoneEnabled()).isFalse();
    }

    @Test
    void createsSavedCommuteWithReturnTripWatchedByDefault() {
        StationEntity lawrenceWest = new StationEntity("lawrence-west", "Lawrence West", 0, 0, false, 10, null);
        StationEntity keele = new StationEntity("keele", "Keele", 0, 0, false, 20, null);
        when(stationRepository.findById("lawrence-west")).thenReturn(Optional.of(lawrenceWest));
        when(stationRepository.findById("keele")).thenReturn(Optional.of(keele));
        when(commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_1", "lawrence-west", "keele")).thenReturn(false);
        when(commuteRepository.save(any(SavedCommuteEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubPath("lawrence-west", "keele");
        stubPath("keele", "lawrence-west");

        AccountResponses.SavedCommuteResponse response = service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("West-end commute", "lawrence-west", "keele", null)
        );

        assertThat(response.watchReturnTrip()).isTrue();
        assertThat(response.outboundLeg().id()).isEqualTo("outbound");
        assertThat(response.outboundLeg().routeLabel()).isEqualTo("Lawrence West -> Keele");
        assertThat(response.returnLeg()).isNotNull();
        assertThat(response.returnLeg().id()).isEqualTo("return");
        assertThat(response.returnLeg().routeLabel()).isEqualTo("Keele -> Lawrence West");
        verify(commutePathService).path("lawrence-west", "keele");
        verify(commutePathService).path("keele", "lawrence-west");
    }

    @Test
    void createsOneWaySavedCommuteWhenReturnTripIsDisabled() {
        StationEntity lawrenceWest = new StationEntity("lawrence-west", "Lawrence West", 0, 0, false, 10, null);
        StationEntity keele = new StationEntity("keele", "Keele", 0, 0, false, 20, null);
        when(stationRepository.findById("lawrence-west")).thenReturn(Optional.of(lawrenceWest));
        when(stationRepository.findById("keele")).thenReturn(Optional.of(keele));
        when(commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_1", "lawrence-west", "keele")).thenReturn(false);
        when(commuteRepository.save(any(SavedCommuteEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubPath("lawrence-west", "keele");

        AccountResponses.SavedCommuteResponse response = service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("One way", "lawrence-west", "keele", false)
        );

        assertThat(response.watchReturnTrip()).isFalse();
        assertThat(response.outboundLeg().routeLabel()).isEqualTo("Lawrence West -> Keele");
        assertThat(response.returnLeg()).isNull();
        verify(commutePathService).path("lawrence-west", "keele");
        verify(commutePathService, never()).path("keele", "lawrence-west");
    }

    @Test
    void rejectsSameOriginAndDestination() {
        assertThatThrownBy(() -> service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("Loop", "union", "union", null)
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsOverlongSavedCommuteLabelBeforeSaving() {
        assertThatThrownBy(() -> service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("A".repeat(121), "finch", "union", null)
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Commute label must be 120 characters or less");
        verify(commuteRepository, never()).save(any(SavedCommuteEntity.class));
    }

    @Test
    void rejectsOverlongStationIdsBeforeRepositoryLookup() {
        String stationId = "a".repeat(81);

        assertThatThrownBy(() -> service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("Bad station", stationId, "union", null)
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Station id must be 80 characters or less");
        verify(stationRepository, never()).findById(stationId);
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
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        when(commuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(stationRepository.findAllById(List.of("finch", "union"))).thenReturn(List.of(finch, union));
        stubPath("finch", "union");
        stubPath("union", "finch");

        AccountResponses.SavedCommuteListResponse response = service.list(account);

        assertThat(response.commutes()).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo("commute_1");
            assertThat(item.routeLabel()).isEqualTo("Finch -> Union");
            assertThat(item.path().estimatedTravelSeconds()).isEqualTo(300);
            assertThat(item.path().weightSource()).isEqualTo("gtfs-scheduled-median");
            assertThat(item.impact().statusLabel()).isEqualTo("Clear");
            assertThat(item.notificationRule().dayMask()).isEqualTo(62);
        });
    }

    @Test
    void updatesSavedCommuteNotificationRuleForCurrentAccount() {
        StationEntity finch = new StationEntity("finch", "Finch", 0, 0, false, 10, null);
        StationEntity union = new StationEntity("union", "Union", 0, 0, true, 20, null);
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        when(commuteRepository.findByIdAndAccountId("commute_1", "user_1")).thenReturn(Optional.of(commute));
        when(commuteRepository.save(commute)).thenReturn(commute);
        when(stationRepository.findAllById(List.of("finch", "union"))).thenReturn(List.of(finch, union));
        stubPath("finch", "union");
        stubPath("union", "finch");

        AccountResponses.SavedCommuteResponse response = service.updateNotificationRule(
            account,
            "commute_1",
            new SavedCommuteService.SavedCommuteNotificationRuleRequest(
                true,
                62,
                8 * 60,
                9 * 60,
                true,
                true,
                new SavedCommuteService.SavedCommuteNotificationEventTypesRequest(
                    true,
                    false,
                    true,
                    true,
                    false
                ),
                new SavedCommuteService.SavedCommuteNotificationScheduleRequest(62, 7 * 60, 9 * 60 + 30),
                new SavedCommuteService.SavedCommuteNotificationScheduleRequest(62, 15 * 60, 19 * 60)
            )
        );

        assertThat(response.notificationRule()).satisfies(rule -> {
            assertThat(rule.dayMask()).isEqualTo(62);
            assertThat(rule.startMinute()).isEqualTo(420);
            assertThat(rule.endMinute()).isEqualTo(570);
            assertThat(rule.eventTypes().delays()).isFalse();
            assertThat(rule.eventTypes().serviceRestored()).isFalse();
            assertThat(rule.outboundSchedule()).satisfies(schedule -> {
                assertThat(schedule.dayMask()).isEqualTo(62);
                assertThat(schedule.startMinute()).isEqualTo(420);
                assertThat(schedule.endMinute()).isEqualTo(570);
            });
            assertThat(rule.returnSchedule()).satisfies(schedule -> {
                assertThat(schedule.dayMask()).isEqualTo(62);
                assertThat(schedule.startMinute()).isEqualTo(900);
                assertThat(schedule.endMinute()).isEqualTo(1140);
            });
        });
        verify(commuteRepository).save(commute);
    }

    @Test
    void disabledEventTypesDoNotMarkSavedCommuteAffectedButRemainVisibleAsIgnoredRouteMatches() {
        AlertDashboardService dashboardService = mock(AlertDashboardService.class);
        SavedCommuteService serviceWithRealImpactMatching = new SavedCommuteService(
            commuteRepository,
            stationRepository,
            commutePathService,
            new CommuteImpactService(dashboardService),
            clock
        );
        StationEntity vaughan = new StationEntity("vaughan-metropolitan-centre", "Vaughan Metropolitan Centre", 0, 0, true, 10, null);
        StationEntity union = new StationEntity("union", "Union", 0, 0, true, 20, null);
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Work",
            "vaughan-metropolitan-centre",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        commute.updateNotificationRule(
            true,
            127,
            null,
            null,
            true,
            true,
            true,
            true,
            false,
            true,
            true,
            Instant.parse("2026-06-05T14:31:00Z")
        );
        String segmentId = "line-1-vaughan-metropolitan-centre-union";
        CommuteResponses.PathResponse path = new CommuteResponses.PathResponse(
            "available",
            List.of("vaughan-metropolitan-centre", "union"),
            List.of(segmentId),
            List.of(new CommuteResponses.PathSegmentHopResponse(
                segmentId,
                "line-1",
                "vaughan-metropolitan-centre",
                "union",
                "forward"
            )),
            List.of("line-1"),
            List.of(),
            2520,
            "gtfs-scheduled-median",
            "Default scheduled route: 2 stations on Line 1, about 42 min"
        );
        when(commuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(stationRepository.findAllById(List.of("vaughan-metropolitan-centre", "union"))).thenReturn(List.of(vaughan, union));
        when(commutePathService.path("vaughan-metropolitan-centre", "union")).thenReturn(path);
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of(new AlertDashboardService.ReducedSpeedZoneDto(
            "rsz-line-1",
            "line-1",
            "1",
            "Reduced Speed Zone",
            "Sheppard West to Wilson",
            "Southbound",
            "Trains are operating through a reduced speed zone.",
            OffsetDateTime.parse("2026-06-05T10:20:00-04:00"),
            OffsetDateTime.parse("2026-06-05T10:25:00-04:00"),
            List.of(segmentId),
            List.of("ttc-route-1"),
            List.of(),
            "TTC Live Alerts",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        )));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        AccountResponses.SavedCommuteResponse response = serviceWithRealImpactMatching.list(account).commutes().getFirst();

        assertThat(response.outboundLeg().impact()).satisfies(impact -> {
            assertThat(impact.status()).isEqualTo("clear");
            assertThat(impact.severity()).isEqualTo("clear");
            assertThat(impact.statusLabel()).isEqualTo("Clear by filters");
            assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
                assertThat(match.kind()).isEqualTo("reduced-speed-zone");
                assertThat(match.ignoredByRule()).isTrue();
            });
            assertThat(impact.travelTimeEstimate().status()).isEqualTo("estimated");
            assertThat(impact.travelTimeEstimate().extraHighSeconds()).isPositive();
        });
    }

    @Test
    void createsNetworkScopedRegionalCommuteWithRouteNotificationRules() {
        RegionalCommutePathService regionalPathService = mock(RegionalCommutePathService.class);
        RegionalCommuteImpactService regionalImpactService = mock(RegionalCommuteImpactService.class);
        SavedCommuteService regionalService = new SavedCommuteService(
            commuteRepository,
            stationRepository,
            commutePathService,
            commuteImpactService,
            regionalPathService,
            regionalImpactService,
            clock
        );
        CommuteResponses.PathResponse path = new CommuteResponses.PathResponse(
            "available",
            List.of("bloor", "mount-dennis", "weston", "pearson-airport"),
            List.of("segment-up-bloor-mount-dennis", "segment-up-mount-dennis-weston", "segment-up-weston-pearson-airport"),
            List.of(),
            List.of("regional-up"),
            List.of(),
            900,
            "regional-topology-estimate",
            "Default regional route: 4 stations on UP, planning estimate about 15 min"
        );
        CommuteResponses.ImpactResponse impact = new CommuteResponses.ImpactResponse(
            "clear", "clear", "Clear", "No fresh regional impacts match this route.", List.of()
        );
        when(regionalPathService.path("bloor", "pearson-airport")).thenReturn(path);
        when(regionalImpactService.impactFor(path)).thenReturn(impact);
        when(commuteRepository.existsByAccountIdAndNetworkIdAndOriginStationIdAndDestinationStationId(
            "user_1", "regional", "bloor", "pearson-airport"
        )).thenReturn(false);
        when(commuteRepository.save(any(SavedCommuteEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.SavedCommuteResponse response = regionalService.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest(
                "Airport",
                "bloor",
                "pearson-airport",
                false,
                null,
                "regional"
            )
        );

        assertThat(response.networkId()).isEqualTo("regional");
        assertThat(response.originStationName()).isEqualTo("Bloor");
        assertThat(response.destinationStationName()).isEqualTo("Pearson Airport");
        assertThat(response.path().lineIds()).containsExactly("regional-up");
        assertThat(response.notificationRule().enabled()).isTrue();
        verify(stationRepository, never()).findById(any());
        verify(commutePathService, never()).path(any(), any());
    }

    @Test
    void updatesTtcCommuteRouteAndRecalculatesBothLegsWithoutChangingNotificationRules() {
        StationEntity queen = new StationEntity("queen", "Queen", 0, 0, false, 10, null);
        StationEntity bloorYonge = new StationEntity("bloor-yonge", "Bloor-Yonge", 0, 0, true, 20, null);
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Old route",
            "finch",
            "union",
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        commute.updateNotificationRule(
            true,
            62,
            420,
            570,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            Instant.parse("2026-06-05T14:05:00Z")
        );
        when(commuteRepository.findByIdAndAccountId("commute_1", "user_1")).thenReturn(Optional.of(commute));
        when(commuteRepository.existsByAccountIdAndNetworkIdAndOriginStationIdAndDestinationStationId(
            "user_1", "ttc", "queen", "bloor-yonge"
        )).thenReturn(false);
        when(stationRepository.findById("queen")).thenReturn(Optional.of(queen));
        when(stationRepository.findById("bloor-yonge")).thenReturn(Optional.of(bloorYonge));
        when(commuteRepository.save(commute)).thenReturn(commute);
        stubPath("queen", "bloor-yonge");
        stubPath("bloor-yonge", "queen");

        AccountResponses.SavedCommuteResponse response = service.updateRoute(
            account,
            "commute_1",
            new SavedCommuteService.UpdateSavedCommuteRequest(
                "Downtown",
                "queen",
                "bloor-yonge",
                true
            )
        );

        assertThat(response.networkId()).isEqualTo("ttc");
        assertThat(response.label()).isEqualTo("Downtown");
        assertThat(response.routeLabel()).isEqualTo("Queen -> Bloor-Yonge");
        assertThat(response.watchReturnTrip()).isTrue();
        assertThat(response.outboundLeg().path().segmentIds())
            .containsExactly("segment_queen_bloor-yonge");
        assertThat(response.returnLeg().path().segmentIds())
            .containsExactly("segment_bloor-yonge_queen");
        assertThat(response.notificationRule()).satisfies(rule -> {
            assertThat(rule.enabled()).isTrue();
            assertThat(rule.outboundEnabled()).isTrue();
            assertThat(rule.returnEnabled()).isFalse();
            assertThat(rule.eventTypes().delays()).isFalse();
            assertThat(rule.eventTypes().reducedSpeedZones()).isTrue();
            assertThat(rule.eventTypes().plannedClosures()).isFalse();
        });
        verify(commutePathService).path("queen", "bloor-yonge");
        verify(commutePathService).path("bloor-yonge", "queen");
    }
}
