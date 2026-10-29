package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.OptionalInt;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Link travel times from the imported GO and UP timetables, so estimated train
 * markers move at the pace the timetable sets for each section of track rather
 * than at one fixed guess for every link. Reloaded a few times a day (imports
 * refresh daily); a failed load is retried shortly and never fails a caller.
 */
@Component
public class ScheduledRegionalLinkTravelTimes implements RegionalLinkTravelTimes {
    private static final Logger log = LoggerFactory.getLogger(ScheduledRegionalLinkTravelTimes.class);
    static final Duration RELOAD_INTERVAL = Duration.ofHours(6);
    static final Duration RETRY_INTERVAL = Duration.ofMinutes(5);
    static final int MIN_LINK_SECONDS = 60;
    static final int MAX_LINK_SECONDS = 2_400;

    private record Loaded(Instant reloadAt, Map<String, Integer> seconds) {}

    private final RegionalGtfsScheduleRepository repository;
    private final Clock clock;
    private final ReentrantLock loadLock = new ReentrantLock();
    private volatile Loaded loaded;

    public ScheduledRegionalLinkTravelTimes(RegionalGtfsScheduleRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Override
    public OptionalInt seconds(String lineId, String fromStationId, String toStationId) {
        Map<String, Integer> links = current();
        Integer seconds = links.get(key(lineId, fromStationId, toStationId));
        if (seconds == null) seconds = links.get(key(lineId, toStationId, fromStationId));
        return seconds == null ? OptionalInt.empty() : OptionalInt.of(seconds);
    }

    private Map<String, Integer> current() {
        Instant now = clock.instant();
        Loaded snapshot = loaded;
        if (snapshot != null && now.isBefore(snapshot.reloadAt())) return snapshot.seconds();
        // One caller reloads; others keep the previous times meanwhile.
        if (!loadLock.tryLock()) return snapshot == null ? Map.of() : snapshot.seconds();
        try {
            Loaded latest = loaded;
            if (latest != null && now.isBefore(latest.reloadAt())) return latest.seconds();
            Loaded next = load(now, latest);
            loaded = next;
            return next.seconds();
        } finally {
            loadLock.unlock();
        }
    }

    private Loaded load(Instant now, Loaded previous) {
        try {
            Map<String, Integer> seconds = new HashMap<>();
            for (RegionalGtfsScheduleRepository.LinkTime link : repository.scheduledLinkTimes()) {
                if (link.seconds() < MIN_LINK_SECONDS || link.seconds() > MAX_LINK_SECONDS) continue;
                seconds.put(key(link.lineId(), link.fromStationId(), link.toStationId()), link.seconds());
            }
            // An empty result (no import yet) is retried soon rather than cached for hours.
            Duration interval = seconds.isEmpty() ? RETRY_INTERVAL : RELOAD_INTERVAL;
            return new Loaded(now.plus(interval), Map.copyOf(seconds));
        } catch (RuntimeException failure) {
            log.warn("Regional timetable link times unavailable; keeping previous values: {}",
                failure.getClass().getSimpleName());
            return new Loaded(now.plus(RETRY_INTERVAL), previous == null ? Map.of() : previous.seconds());
        }
    }

    private static String key(String lineId, String fromStationId, String toStationId) {
        return lineId + "|" + fromStationId + "|" + toStationId;
    }
}
