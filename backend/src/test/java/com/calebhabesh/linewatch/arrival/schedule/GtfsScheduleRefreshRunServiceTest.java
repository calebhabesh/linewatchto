package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

class GtfsScheduleRefreshRunServiceTest {
    private final GtfsScheduleRefreshRunStore store = mock(GtfsScheduleRefreshRunStore.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-20T19:00:00Z"), ZoneOffset.UTC);
    private final GtfsScheduleRefreshRunService service = new GtfsScheduleRefreshRunService(store, clock);
    private final GtfsScheduleImportService.ImportSummary summary =
        new GtfsScheduleImportService.ImportSummary(42L, 1, 3, 1, 1, 1, 1500, 2);

    @Test
    void startsAndCompletesScheduleRefreshRuns() {
        when(store.createRunning(Instant.parse("2026-06-20T19:00:00Z").atOffset(ZoneOffset.UTC)))
            .thenReturn(17L);

        long id = service.start();
        service.succeed(id, summary);

        assertThat(id).isEqualTo(17L);
        verify(store).markSuccess(
            eq(17L),
            eq(Instant.parse("2026-06-20T19:00:00Z").atOffset(ZoneOffset.UTC)),
            eq(1500)
        );
    }

    @Test
    void truncatesPersistedFailureMessagesToOneThousandCharacters() {
        service.fail(17L, new IllegalStateException("x".repeat(1200)));

        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(store).markFailed(
            eq(17L),
            eq(Instant.parse("2026-06-20T19:00:00Z").atOffset(ZoneOffset.UTC)),
            message.capture()
        );
        assertThat(message.getValue()).hasSize(1000);
    }

    @Test
    void annotationsHaveRequiresNewPropagation() throws Exception {
        assertRequiresNew("start");
        assertRequiresNew("succeed", long.class, GtfsScheduleImportService.ImportSummary.class);
        assertRequiresNew("fail", long.class, Throwable.class);
    }

    private void assertRequiresNew(String methodName, Class<?>... parameterTypes) throws Exception {
        Transactional transactional = GtfsScheduleRefreshRunService.class
            .getMethod(methodName, parameterTypes)
            .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
    }
}
