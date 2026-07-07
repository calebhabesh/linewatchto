package com.calebhabesh.linewatch.push;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.calebhabesh.linewatch.ingestion.TtcAlertIngestionSucceededEvent;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class PushNotificationIngestionListenerTest {
    @Test
    void evaluatesPushNotificationsWhenAlertIngestionSucceeds() {
        PushNotificationDispatchService dispatchService = mock(PushNotificationDispatchService.class);
        PushNotificationIngestionListener listener = new PushNotificationIngestionListener(dispatchService);

        listener.onTtcAlertIngestionSucceeded(new TtcAlertIngestionSucceededEvent(
            42L,
            OffsetDateTime.parse("2026-06-01T15:55:00Z")
        ));

        verify(dispatchService).evaluateSavedCommuteNotifications();
    }
}
