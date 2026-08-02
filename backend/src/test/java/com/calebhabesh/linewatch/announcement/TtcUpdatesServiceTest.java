package com.calebhabesh.linewatch.announcement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcUpdatesServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-01T15:00:00Z"), ZoneOffset.UTC);
    private final TtcUpdatesClient client = mock(TtcUpdatesClient.class);
    private final TtcUpdatesProperties properties = new TtcUpdatesProperties();

    @Test
    void cachesAParsedListingForTheConfiguredRefreshInterval() {
        properties.setRefreshInterval(Duration.ofHours(6));
        var detail = new TtcAnnouncementResponses.Detail(
            "one", "update", "Fare update", "", "https://www.ttc.ca/update", null, null, null, TtcUpdatesService.SOURCE
        );
        when(client.fetch()).thenReturn(List.of(detail));
        TtcUpdatesService service = new TtcUpdatesService(client, properties, CLOCK);

        assertThat(service.current().announcements()).containsExactly(detail);
        assertThat(service.current().announcements()).containsExactly(detail);
        verify(client).fetch();
        verifyNoMoreInteractions(client);
    }

    @Test
    void reportsTheListingUnavailableWhenTheRefreshFails() {
        when(client.fetch()).thenThrow(new RuntimeException("down"));
        TtcUpdatesService service = new TtcUpdatesService(client, properties, CLOCK);

        assertThat(service.current().available()).isFalse();
        assertThat(service.current().announcements()).isEmpty();
    }
}
