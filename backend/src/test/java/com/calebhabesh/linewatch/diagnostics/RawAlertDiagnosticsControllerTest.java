package com.calebhabesh.linewatch.diagnostics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class RawAlertDiagnosticsControllerTest {
    private final RawAlertDiagnosticsProperties properties = new RawAlertDiagnosticsProperties();
    private final TtcAlertStore ttcStore = mock(TtcAlertStore.class);
    private final RegionalAlertStore regionalStore = mock(RegionalAlertStore.class);
    private final RawAlertDiagnosticsController controller = new RawAlertDiagnosticsController(
        properties,
        ttcStore,
        regionalStore
    );

    @Test
    void capabilitiesAreDisabledByDefaultAndNeverCached() {
        var response = controller.capabilities();

        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().rawAlertsEnabled()).isFalse();
    }

    @Test
    void disabledRawEndpointReturnsNotFoundWithoutReadingStores() {
        assertThatThrownBy(() -> controller.ttc(50, 0))
            .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));

        verifyNoInteractions(ttcStore, regionalStore);
    }

    @Test
    void enabledEndpointReturnsAPaginatedNoStoreResponse() {
        properties.setEnabled(true);
        RawAlertDto first = alert("one");
        RawAlertDto second = alert("two");
        when(regionalStore.findRawAlerts(2, 10)).thenReturn(List.of(first, second));

        var response = controller.regional(1, 10);

        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().items()).containsExactly(first);
        assertThat(response.getBody().hasMore()).isTrue();
        assertThat(response.getBody().offset()).isEqualTo(10);
        verify(regionalStore).findRawAlerts(2, 10);
    }

    @Test
    void rejectsUnboundedPageSizes() {
        properties.setEnabled(true);

        assertThatThrownBy(() -> controller.ttc(101, 0))
            .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private RawAlertDto alert(String id) {
        return new RawAlertDto(
            "routes",
            id,
            "Subway",
            OffsetDateTime.parse("2026-08-13T12:00:00-04:00"),
            "{\"id\":\"" + id + "\"}",
            true
        );
    }
}
