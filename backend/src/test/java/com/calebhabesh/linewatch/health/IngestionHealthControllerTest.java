package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class IngestionHealthControllerTest {
    private final IngestionRunStore store = mock(IngestionRunStore.class);
    private final IngestionHealthController controller = new IngestionHealthController(store);

    @Test
    void returnsNotRunStateBeforeFirstPoll() {
        when(store.findLatest()).thenReturn(Optional.empty());

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("not-run");
        assertThat(response.dashboardLive()).isFalse();
    }

    @Test
    void returnsLatestRunWithoutClaimingDashboardIsLive() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T07:00:00Z");
        when(store.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L, "success", started, started.plusSeconds(2),
            44, 44, 12, 3, started.minusMinutes(1), null
        )));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.recordsFetched()).isEqualTo(44);
        assertThat(response.recordsNormalized()).isEqualTo(12);
        assertThat(response.dashboardLive()).isFalse();
    }
}
