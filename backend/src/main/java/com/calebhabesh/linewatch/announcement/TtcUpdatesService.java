package com.calebhabesh.linewatch.announcement;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TtcUpdatesService {
    public static final String SOURCE = "TTC.ca Updates";
    private static final Logger log = LoggerFactory.getLogger(TtcUpdatesService.class);

    private final TtcUpdatesClient client;
    private final TtcUpdatesProperties properties;
    private final Clock clock;
    private volatile Snapshot cached;

    public TtcUpdatesService(TtcUpdatesClient client, TtcUpdatesProperties properties, Clock clock) {
        this.client = client;
        this.properties = properties;
        this.clock = clock;
    }

    public Snapshot current() {
        if (!properties.isEnabled()) {
            return new Snapshot(false, null, List.of());
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        Snapshot snapshot = cached;
        if (snapshot != null && !refreshDue(snapshot, now)) {
            return snapshot;
        }
        synchronized (this) {
            snapshot = cached;
            if (snapshot != null && !refreshDue(snapshot, now)) {
                return snapshot;
            }
            try {
                snapshot = new Snapshot(true, now, client.fetch());
            } catch (RuntimeException exception) {
                log.warn("Unable to refresh the TTC Updates listing: {}", exception.getMessage());
                snapshot = new Snapshot(false, now, List.of());
            }
            cached = snapshot;
            return snapshot;
        }
    }

    private boolean refreshDue(Snapshot snapshot, OffsetDateTime now) {
        if (snapshot.fetchedAt() == null) {
            return true;
        }
        Duration interval = snapshot.available()
            ? properties.getRefreshInterval()
            : properties.getRetryInterval();
        if (interval == null || interval.isZero() || interval.isNegative()) {
            return true;
        }
        return !now.isBefore(snapshot.fetchedAt().plus(interval));
    }

    public record Snapshot(
        boolean available,
        OffsetDateTime fetchedAt,
        List<TtcAnnouncementResponses.Detail> announcements
    ) {}
}
