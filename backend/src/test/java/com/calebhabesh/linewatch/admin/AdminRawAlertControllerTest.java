package com.calebhabesh.linewatch.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class AdminRawAlertControllerTest {
    private static final String OPERATOR_TOKEN = "operator-token-with-at-least-32-characters";
    private final AdminRawLogProperties properties = new AdminRawLogProperties();
    private final TtcAlertStore ttcStore = mock(TtcAlertStore.class);
    private final RegionalAlertStore regionalStore = mock(RegionalAlertStore.class);
    private final AdminRawAlertController controller = new AdminRawAlertController(
        new AdminRawLogAccess(properties),
        ttcStore,
        regionalStore
    );

    @Test
    void endpointIsNotAvailableWhenOperatorAccessIsDisabled() {
        assertThatThrownBy(() -> controller.ttc(null, 50, 0))
            .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void enabledEndpointRejectsMissingOrIncorrectBearerToken() {
        properties.setEnabled(true);
        properties.setToken(OPERATOR_TOKEN);

        assertThatThrownBy(() -> controller.ttc(null, 50, 0))
            .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> controller.ttc("Bearer wrong", 50, 0))
            .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void authorizedEndpointReturnsAPaginatedNoStoreResponse() {
        properties.setEnabled(true);
        properties.setToken(OPERATOR_TOKEN);
        RawAlertDto first = alert("one");
        RawAlertDto second = alert("two");
        when(ttcStore.getRawAlerts(2, 10)).thenReturn(List.of(first, second));

        var response = controller.ttc("Bearer " + OPERATOR_TOKEN, 1, 10);

        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().items()).containsExactly(first);
        assertThat(response.getBody().hasMore()).isTrue();
        assertThat(response.getBody().offset()).isEqualTo(10);
        verify(ttcStore).getRawAlerts(2, 10);
    }

    @Test
    void rejectsUnboundedPageSizes() {
        properties.setEnabled(true);
        properties.setToken(OPERATOR_TOKEN);

        assertThatThrownBy(() -> controller.regional("Bearer " + OPERATOR_TOKEN, 101, 0))
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
