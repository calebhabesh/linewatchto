package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import tools.jackson.databind.JsonNode;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class RegionalAlertExtractionServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-31T05:00:00Z");
    /** 05:00 UTC is still October 30 in Pacific time, when Gemini quotas reset. */
    private static final LocalDate QUOTA_DAY = LocalDate.parse("2026-10-30");
    private static final String MODEL = "gemini-3.5-flash-lite";
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private final RegionalAlertExtractionStore store = mock(RegionalAlertExtractionStore.class);
    private final RegionalAlertExtractionClient client = mock(RegionalAlertExtractionClient.class);
    private final RegionalAlertExtractionProperties properties = new RegionalAlertExtractionProperties();
    private RegionalAlertExtractionService service;

    @BeforeEach
    void setUp() {
        properties.setEnabled(true);
        properties.setApiKey("key");
        properties.setModel(MODEL);
        when(store.claim(any(Long.class), any(), any())).thenReturn(true);
        service = new RegionalAlertExtractionService(properties, store, client, objectMapper,
            Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void storesAValidatedReadingWithItsDifferencesFromTheDeterministicClassification() {
        RegionalAlertExtractionInput input = upInput();
        when(store.requestsOn(QUOTA_DAY, MODEL)).thenReturn(0);
        when(store.findDue(eq(MODEL), anyString(), any(), any(), eq(5))).thenReturn(List.of(
            new RegionalAlertExtractionStore.Due(11, service.inputJson(input), deterministicJson("union", "weston"), 0)));
        when(client.extract(any())).thenReturn(objectMapper.readTree("""
            {"effect":"no-service","scope":"segment-span","spanFrom":"union","spanTo":"pearson-airport",
             "listedStations":[],"replacement":"go-bus","skippedStations":["weston"],"statedWindow":null,
             "confidence":"high"}
            """));

        assertThat(service.processDue()).isEqualTo(1);

        ArgumentCaptor<String> result = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> differences = ArgumentCaptor.forClass(String.class);
        verify(store).recordRequest(QUOTA_DAY, MODEL);
        verify(store).succeed(eq(11L), result.capture(), differences.capture(), any());
        JsonNode stored = objectMapper.readTree(result.getValue());
        assertThat(stored.path("spans")).hasSize(1);
        assertThat(stored.path("spans").path(0).path("from").asText()).isEqualTo("union");
        assertThat(stored.path("spans").path(0).path("to").asText()).isEqualTo("pearson-airport");
        assertThat(objectMapper.readTree(differences.getValue())).extracting(node -> node.asText())
            .containsExactly("span: union-weston vs union-pearson-airport", "skipped: [] vs [weston]");
    }

    @Test
    void rejectsRepliesThatNameStationsOffTheLine() {
        when(store.findDue(any(), any(), any(), any(), anyInt())).thenReturn(List.of(
            new RegionalAlertExtractionStore.Due(12, service.inputJson(upInput()), deterministicJson("union", "weston"), 0)));
        when(client.extract(any())).thenReturn(objectMapper.readTree("""
            {"effect":"no-service","scope":"segment-span","spanFrom":"union","spanTo":"kipling",
             "replacement":"none","skippedStations":[],"confidence":"high"}
            """));

        service.processDue();

        verify(store).finish(eq(12L), eq("rejected"), eq("schema:unknown-station"), any());
        verify(store, never()).succeed(any(Long.class), any(), any(), any());
    }

    @Test
    void stopsTheRunOnAQuotaWaitWithoutSpendingAnAttempt() {
        when(store.findDue(any(), any(), any(), any(), anyInt())).thenReturn(List.of(
            new RegionalAlertExtractionStore.Due(13, service.inputJson(upInput()), null, 2),
            new RegionalAlertExtractionStore.Due(14, service.inputJson(upInput()), null, 0)));
        when(client.extract(any())).thenThrow(
            new RegionalAlertExtractionClient.ExtractionException("rate-limited", true, Duration.ofMinutes(20)));

        assertThat(service.processDue()).isEqualTo(1);

        verify(store).retryLater(13L, "rate-limited", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusMinutes(20), false);
        verify(client, times(1)).extract(any());
    }

    @Test
    void backsOffTransientFailuresAndGivesUpAfterTheAttemptLimit() {
        when(store.findDue(any(), any(), any(), any(), anyInt())).thenReturn(List.of(
            new RegionalAlertExtractionStore.Due(15, service.inputJson(upInput()), null, 1),
            new RegionalAlertExtractionStore.Due(16, service.inputJson(upInput()), null, 4)));
        when(client.extract(any())).thenThrow(
            new RegionalAlertExtractionClient.ExtractionException("http-503", true, null));

        service.processDue();

        // Second attempt waits twice the base backoff.
        verify(store).retryLater(15L, "http-503", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusMinutes(10), true);
        verify(store).finish(eq(16L), eq("failed"), eq("http-503"), any());
        assertThat(service.backoff(20)).isEqualTo(Duration.ofHours(6));
    }

    @Test
    void sendsNothingOnceTheDailyBudgetIsSpentOrWithoutAKey() {
        when(store.requestsOn(QUOTA_DAY, MODEL)).thenReturn(400);
        assertThat(service.processDue()).isZero();
        verify(store, never()).findDue(any(), any(), any(), any(), anyInt());
        verifyNoInteractions(client);

        properties.setApiKey("");
        assertThat(service.processDue()).isZero();
        service.observe(List.of(classification("no-service")));
        verify(store, never()).observe(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void recordsNoticesButSkipsStructuredTripCancellations() {
        when(store.observe(any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new RegionalAlertExtractionStore.Observed(1, "pending", null, null));

        service.observe(List.of(classification("no-service"), classification("trip-cancellation")));

        verify(store, times(1)).observe(eq(upInput().contentHash()), eq(MODEL),
            eq(RegionalAlertExtractionClient.PROMPT_VERSION), eq("up-1"), anyString(), anyString(), any(), any());
    }

    @Test
    void classifiesFromStoredReadingsOnlyInPrimaryMode() {
        RegionalAlertClassification deterministic = classification("no-service");
        when(store.findSucceeded(any(), any(), any())).thenReturn(Map.of(upInput().contentHash(), """
            {"effect":"no-service","scope":"corridor","spanFrom":null,"spanTo":null,"listedStations":[],
             "replacement":"go-bus","skippedStations":["weston"],"statedWindow":null,"confidence":"high"}
            """));

        properties.setMode(RegionalAlertExtractionProperties.Mode.SHADOW);
        assertThat(service.refine(List.of(deterministic))).containsExactly(deterministic);
        verify(store, never()).findSucceeded(any(), any(), any());

        properties.setMode(RegionalAlertExtractionProperties.Mode.PRIMARY);
        assertThat(service.refine(List.of(deterministic))).singleElement().satisfies(refined -> {
            assertThat(refined.scope()).isEqualTo("corridor");
            assertThat(refined.stationRoles()).containsEntry("weston", "replacement-excluded");
        });

        // A store failure keeps the deterministic classification.
        when(store.findSucceeded(any(), any(), any())).thenThrow(new IllegalStateException("database down"));
        assertThat(service.refine(List.of(deterministic))).containsExactly(deterministic);
    }

    @Test
    void readsThisPollsNewNoticesBeforeAlertsAreStored() {
        RegionalAlertExtractionInput input = upInput();
        when(store.findDueByHashes(List.of(input.contentHash()), MODEL, RegionalAlertExtractionClient.PROMPT_VERSION,
            OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC), 5)).thenReturn(List.of(
            new RegionalAlertExtractionStore.Due(21, service.inputJson(input), deterministicJson("union", "weston"), 0)));
        when(client.extract(any())).thenReturn(objectMapper.readTree("""
            {"effect":"no-service","scope":"corridor","replacement":"go-bus","skippedStations":[],
             "listedStations":[],"confidence":"high"}
            """));

        assertThat(service.readNew(List.of(classification("no-service"), classification("trip-cancellation"))))
            .isEqualTo(1);

        verify(store).succeed(eq(21L), anyString(), anyString(), any());
    }

    @Test
    void skipsANoticeTheBackgroundJobAlreadyClaimed() {
        when(store.findDueByHashes(any(), any(), any(), any(), anyInt())).thenReturn(List.of(
            new RegionalAlertExtractionStore.Due(22, service.inputJson(upInput()), null, 0)));
        when(store.claim(eq(22L), any(), any())).thenReturn(false);

        assertThat(service.readNew(List.of(classification("no-service")))).isZero();
        verifyNoInteractions(client);

        // A zero poll limit leaves every new notice to the background job.
        properties.setPollRequestLimit(0);
        assertThat(service.readNew(List.of(classification("no-service")))).isZero();
        verify(store, times(1)).findDueByHashes(any(), any(), any(), any(), anyInt());
    }

    private static RegionalAlertExtractionInput upInput() {
        return new RegionalAlertExtractionInput("up-1", List.of("regional-up"), "Weekend service adjustments",
            "GO buses replace UP Express trains.", List.of());
    }

    private String deterministicJson(String from, String to) {
        return service.readingJson(new RegionalAlertExtractionPolicy.Reading(
            "no-service", "segment-span", List.of(from, to), List.of(), "go-bus", List.of()));
    }

    private static RegionalAlertClassification classification(String effect) {
        OffsetDateTime start = OffsetDateTime.parse("2026-10-31T04:00:00Z");
        return new RegionalAlertClassification("up-1",
            List.of(new RegionalAlertClassification.SourceReference("go-service-alerts", "M1")),
            List.of("regional-up"), List.of(), "planned", effect, null, "segment-span", null, "go-bus", null,
            "Weekend service adjustments", "GO buses replace UP Express trains.", start, start.plusDays(2),
            "text-date-range", start, start.plusDays(2), start, List.of(), List.of("union", "weston"), Map.of(),
            Map.of(), "{}", List.of(new RegionalAlertClassification.Impact("window-0", effect, "segment-span",
                List.of("union", "weston"), start, start.plusDays(2), "text-date-range", "explicit service window", null)));
    }
}
