package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class RegionalGtfsScheduleRefreshJobTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-02T20:00:00Z"), ZoneOffset.UTC);

    private RegionalArrivalProperties properties;
    private RegionalGtfsScheduleImportService importService;
    private RegionalGtfsScheduleRepository repository;
    private HttpClient httpClient;

    @BeforeEach
    void setUp() {
        properties = new RegionalArrivalProperties();
        importService = mock(RegionalGtfsScheduleImportService.class);
        repository = mock(RegionalGtfsScheduleRepository.class);
        httpClient = mock(HttpClient.class);
    }

    @Test
    void normalizesDoubleEncodedMetrolinxPathWithoutReencodingPercentEscapes() {
        URI source = URI.create(
            "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%2520Data/GO-GTFS.zip"
        );

        URI normalized = RegionalGtfsScheduleRefreshJob.normalizeSourceUri(source);

        assertThat(normalized.toASCIIString()).isEqualTo(
            "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip"
        );
    }

    @Test
    @SuppressWarnings("unchecked")
    void streamsDownloadsToTemporaryFilesAndUsesNormalizedRequestUris() throws Exception {
        properties.setScheduleEnabled(true);
        properties.setScheduleRefreshEnabled(true);
        properties.setScheduleReadTimeout(Duration.ofMinutes(2));
        properties.setGoScheduleUrl(URI.create("https://example.test/Open%2520Data/GO-GTFS.zip"));
        properties.setUpScheduleUrl(URI.create("https://example.test/Open%20Data/UP-GTFS.zip"));
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenAnswer(ignored -> new ByteArrayInputStream(new byte[] {1, 2, 3}));
        when(httpClient.send(
            any(HttpRequest.class),
            any(HttpResponse.BodyHandler.class)
        )).thenReturn(response);
        when(importService.importZip(any(Path.class), anyString(), anyString())).thenAnswer(invocation ->
            new RegionalGtfsScheduleImportService.ImportSummary(
                1, invocation.getArgument(1), 1, 1, 1,
                LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01")
            )
        );
        RegionalGtfsScheduleRefreshJob job =
            new RegionalGtfsScheduleRefreshJob(properties, importService, repository, httpClient, CLOCK);

        job.refresh();

        ArgumentCaptor<HttpRequest> requests = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(
            requests.capture(),
            any(HttpResponse.BodyHandler.class)
        );
        assertThat(requests.getAllValues())
            .extracting(request -> request.uri().toASCIIString())
            .containsExactly(
                "https://example.test/Open%20Data/GO-GTFS.zip",
                "https://example.test/Open%20Data/UP-GTFS.zip"
            );
        assertThat(requests.getAllValues())
            .allSatisfy(request -> assertThat(request.timeout()).contains(Duration.ofMinutes(2)));

        ArgumentCaptor<Path> paths = ArgumentCaptor.forClass(Path.class);
        verify(importService, times(2)).importZip(paths.capture(), anyString(), anyString());
        assertThat(paths.getAllValues()).allSatisfy(path -> assertThat(Files.exists(path)).isFalse());
    }

    @Test
    void skipsDownloadsWhenPersistedImportsAreNewerThanTheRefreshInterval() throws Exception {
        properties.setScheduleEnabled(true);
        properties.setScheduleRefreshEnabled(true);
        properties.setScheduleRefreshFixedDelay(Duration.ofHours(24));
        when(repository.activeImport("go")).thenReturn(Optional.of(activeImport("go", "2026-08-02T12:00:00Z")));
        when(repository.activeImport("up")).thenReturn(Optional.of(activeImport("up", "2026-08-02T12:00:00Z")));
        RegionalGtfsScheduleRefreshJob job =
            new RegionalGtfsScheduleRefreshJob(properties, importService, repository, httpClient, CLOCK);

        job.refresh();

        verify(httpClient, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        verify(importService, never()).importZip(any(Path.class), anyString(), anyString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void refreshesOnlyTheSourceWhosePersistedImportHasReachedTheRefreshInterval() throws Exception {
        properties.setScheduleEnabled(true);
        properties.setScheduleRefreshEnabled(true);
        properties.setScheduleRefreshFixedDelay(Duration.ofHours(24));
        when(repository.activeImport("go")).thenReturn(Optional.of(activeImport("go", "2026-08-01T12:00:00Z")));
        when(repository.activeImport("up")).thenReturn(Optional.of(activeImport("up", "2026-08-02T12:00:00Z")));
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        when(importService.importZip(any(Path.class), anyString(), anyString())).thenReturn(
            new RegionalGtfsScheduleImportService.ImportSummary(
                1, "go", 1, 1, 1, LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01")
            )
        );
        RegionalGtfsScheduleRefreshJob job =
            new RegionalGtfsScheduleRefreshJob(properties, importService, repository, httpClient, CLOCK);

        job.refresh();

        verify(httpClient, times(1)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        verify(importService).importZip(any(Path.class), eq("go"), anyString());
    }

    @Test
    void configuresTheScheduleClientConnectTimeout() {
        properties.setScheduleConnectTimeout(Duration.ofSeconds(17));

        HttpClient client = new MetrolinxConfiguration().regionalScheduleHttpClient(properties);

        assertThat(client.connectTimeout()).contains(Duration.ofSeconds(17));
        assertThat(client.followRedirects()).isEqualTo(HttpClient.Redirect.NORMAL);
    }

    private RegionalGtfsScheduleRepository.ActiveImport activeImport(String source, String importedAt) {
        return new RegionalGtfsScheduleRepository.ActiveImport(
            1L,
            source,
            "https://example.test/" + source + ".zip",
            OffsetDateTime.parse(importedAt),
            LocalDate.parse("2026-07-01"),
            LocalDate.parse("2026-09-01")
        );
    }
}
