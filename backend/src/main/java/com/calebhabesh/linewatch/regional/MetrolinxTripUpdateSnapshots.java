package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * One shared, briefly cached GO and UP TripUpdates snapshot. Train markers
 * and UP station arrivals read the same snapshot, so a marker's predicted
 * arrival and the station's arrival tile come from the same prediction.
 *
 * A failed fetch keeps serving the last good snapshot while its source
 * timestamp is recent, so one bad request does not drop every UP marker.
 */
@Component
public class MetrolinxTripUpdateSnapshots {
    static final String GO_TRIP_UPDATES_PATH = "api/V1/Gtfs/Feed/TripUpdates";
    /** About as often as the Metrolinx feeds change (every 10-20 s). */
    static final Duration CACHE_TTL = Duration.ofSeconds(10);
    /** The oldest source snapshot still served after failed fetches. */
    static final Duration LAST_GOOD_MAX_AGE = Duration.ofMinutes(2);

    private record Entry<T>(T feed, OffsetDateTime checkedAt) {}

    private final MetrolinxFeedFetcher fetcher;
    private final MetrolinxUpTripUpdateParser parser;
    private final Clock clock;
    private final AtomicReference<Entry<UpTripUpdateFeed>> up = new AtomicReference<>();
    private final AtomicReference<Entry<GoTripUpdateFeed>> go = new AtomicReference<>();
    private final Object upLock = new Object();
    private final Object goLock = new Object();

    public MetrolinxTripUpdateSnapshots(MetrolinxFeedFetcher fetcher, MetrolinxUpTripUpdateParser parser, Clock clock) {
        this.fetcher = fetcher;
        this.parser = parser;
        this.clock = clock;
    }

    public UpTripUpdateFeed up() {
        return snapshot(up, upLock, () -> parser.parse(fetcher.fetch(
            MetrolinxArrivalClient.UP_TRIP_UPDATES_PATH, "Metrolinx UP Express GTFS-RT TripUpdates"
        )), UpTripUpdateFeed::sourceUpdatedAt);
    }

    public GoTripUpdateFeed go() {
        return snapshot(go, goLock, () -> parser.parseGo(fetcher.fetch(
            GO_TRIP_UPDATES_PATH, "Metrolinx GO GTFS-RT TripUpdates"
        )), GoTripUpdateFeed::sourceUpdatedAt);
    }

    private <T> T snapshot(
        AtomicReference<Entry<T>> reference,
        Object lock,
        Supplier<T> fetch,
        Function<T, OffsetDateTime> sourceUpdatedAt
    ) {
        Entry<T> current = reference.get();
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (current != null && current.checkedAt().plus(CACHE_TTL).isAfter(now)) return current.feed();
        synchronized (lock) {
            // Another request may have refreshed it while this one waited.
            current = reference.get();
            now = OffsetDateTime.now(clock);
            if (current != null && current.checkedAt().plus(CACHE_TTL).isAfter(now)) return current.feed();
            try {
                T feed = fetch.get();
                reference.set(new Entry<>(feed, now));
                return feed;
            } catch (MetrolinxClientException failure) {
                OffsetDateTime lastSource = current == null ? null : sourceUpdatedAt.apply(current.feed());
                if (lastSource != null && Duration.between(lastSource, now).compareTo(LAST_GOOD_MAX_AGE) <= 0) {
                    // Wait a full cache period before trying again.
                    reference.set(new Entry<>(current.feed(), now));
                    return current.feed();
                }
                throw failure;
            }
        }
    }
}
