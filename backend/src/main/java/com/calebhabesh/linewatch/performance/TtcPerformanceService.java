package com.calebhabesh.linewatch.performance;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class TtcPerformanceService {
    private static final Logger log = LoggerFactory.getLogger(TtcPerformanceService.class);
    private static final String REDIS_KEY = "linewatch:performance:last_successful";

    private final TtcPerformanceClient client;
    private final TtcPerformanceProperties properties;
    private final Clock clock;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private volatile CachedPerformanceSnapshot lastAttempt;
    private volatile TtcPerformanceResponses.SnapshotResponse lastSuccessfulSnapshot;

    @Autowired
    public TtcPerformanceService(
        TtcPerformanceClient client,
        TtcPerformanceProperties properties,
        Clock clock,
        StringRedisTemplate redis,
        ObjectMapper objectMapper,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.client = client;
        this.properties = properties;
        this.clock = clock;
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    public TtcPerformanceService(
        TtcPerformanceClient client,
        TtcPerformanceProperties properties,
        Clock clock,
        StringRedisTemplate redis,
        ObjectMapper objectMapper
    ) {
        this(client, properties, clock, redis, objectMapper, null, null);
    }

    public TtcPerformanceResponses.SnapshotResponse performance() {
        if (cache == null || cacheProperties == null) {
            return current();
        }
        return cache.getOrComputeIf(
            "performance",
            new TypeReference<TtcPerformanceResponses.SnapshotResponse>() {},
            cacheProperties.getPerformanceTtl(),
            TtcPerformanceService::isCacheableSnapshot,
            this::current
        );
    }

    public static boolean isCacheableSnapshot(TtcPerformanceResponses.SnapshotResponse snapshot) {
        return snapshot != null && snapshot.metrics() != null && !snapshot.metrics().isEmpty();
    }

    public TtcPerformanceResponses.SnapshotResponse current() {
        if (!properties.isEnabled()) {
            return disabledSnapshot();
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        CachedPerformanceSnapshot cached = lastAttempt;
        if (cached != null && !isRefreshDue(cached.attemptedAt(), now)) {
            return cachedSnapshotOrRecoveredLastSuccessful(cached, now);
        }

        synchronized (this) {
            cached = lastAttempt;
            if (cached != null && !isRefreshDue(cached.attemptedAt(), now)) {
                return cachedSnapshotOrRecoveredLastSuccessful(cached, now);
            }
            return refresh(now);
        }
    }

    private TtcPerformanceResponses.SnapshotResponse cachedSnapshotOrRecoveredLastSuccessful(
        CachedPerformanceSnapshot cached,
        OffsetDateTime now
    ) {
        if (!isUnavailableWithoutMetrics(cached.snapshot())) {
            return cached.snapshot();
        }
        TtcPerformanceResponses.SnapshotResponse recovered = staleLastSuccessfulSnapshot(now);
        if (recovered == null) {
            return cached.snapshot();
        }
        lastAttempt = new CachedPerformanceSnapshot(recovered, now);
        return recovered;
    }

    private boolean isUnavailableWithoutMetrics(TtcPerformanceResponses.SnapshotResponse snapshot) {
        return snapshot != null
            && "unavailable".equals(snapshot.status())
            && (snapshot.metrics() == null || snapshot.metrics().isEmpty());
    }

    private TtcPerformanceResponses.SnapshotResponse refresh(OffsetDateTime now) {
        try {
            TtcPerformanceResponses.SnapshotResponse snapshot = client.fetch();
            lastSuccessfulSnapshot = snapshot;
            saveToRedis(snapshot);
            lastAttempt = new CachedPerformanceSnapshot(snapshot, now);
            return snapshot;
        } catch (RuntimeException exception) {
            TtcPerformanceResponses.SnapshotResponse snapshot = staleLastSuccessfulSnapshot(now);
            if (snapshot == null) {
                snapshot = unavailableSnapshot();
            }
            lastAttempt = new CachedPerformanceSnapshot(snapshot, now);
            return snapshot;
        }
    }

    private boolean isRefreshDue(OffsetDateTime attemptedAt, OffsetDateTime now) {
        Duration refreshInterval = properties.getRefreshInterval();
        if (refreshInterval == null || refreshInterval.isZero() || refreshInterval.isNegative()) {
            return true;
        }
        return !now.isBefore(attemptedAt.plus(refreshInterval));
    }

    private TtcPerformanceResponses.SnapshotResponse staleLastSuccessfulSnapshot(OffsetDateTime now) {
        TtcPerformanceResponses.SnapshotResponse snapshot = lastSuccessfulSnapshot;
        if (snapshot == null) {
            snapshot = loadFromRedis();
            if (snapshot != null) {
                lastSuccessfulSnapshot = snapshot;
            }
        }

        if (snapshot == null || !isWithinMaxAge(snapshot, now)) {
            return null;
        }
        return new TtcPerformanceResponses.SnapshotResponse(
            snapshot.status(),
            snapshot.source(),
            snapshot.sourceUrl(),
            snapshot.title(),
            snapshot.updatedLabel(),
            snapshot.fetchedAt(),
            true,
            "Using the last successful TTC.ca performance snapshot because the latest refresh failed.",
            snapshot.metrics()
        );
    }

    private boolean isWithinMaxAge(TtcPerformanceResponses.SnapshotResponse snapshot, OffsetDateTime now) {
        Duration maxAge = properties.getMaxAge();
        if (maxAge == null || maxAge.isZero() || maxAge.isNegative() || snapshot.fetchedAt() == null) {
            return true;
        }
        return !now.isAfter(snapshot.fetchedAt().plus(maxAge));
    }

    private void saveToRedis(TtcPerformanceResponses.SnapshotResponse snapshot) {
        try {
            redis.opsForValue().set(REDIS_KEY, objectMapper.writeValueAsString(snapshot));
        } catch (Exception e) {
            log.warn("Failed to persist performance snapshot to Redis", e);
        }
    }

    private TtcPerformanceResponses.SnapshotResponse loadFromRedis() {
        try {
            String json = redis.opsForValue().get(REDIS_KEY);
            if (json != null && !json.isBlank()) {
                return objectMapper.readValue(json, TtcPerformanceResponses.SnapshotResponse.class);
            }
        } catch (Exception e) {
            log.warn("Failed to load performance snapshot from Redis", e);
        }
        return null;
    }

    private TtcPerformanceResponses.SnapshotResponse disabledSnapshot() {
        return new TtcPerformanceResponses.SnapshotResponse(
            "disabled",
            "TTC.ca",
            properties.getUrl().toString(),
            "On-time performance and elevator/escalator status",
            "Disabled",
            null,
            true,
            "Official TTC performance metrics are disabled in this environment.",
            List.of()
        );
    }

    private TtcPerformanceResponses.SnapshotResponse unavailableSnapshot() {
        return new TtcPerformanceResponses.SnapshotResponse(
            "unavailable",
            "TTC.ca",
            properties.getUrl().toString(),
            "On-time performance and elevator/escalator status",
            "Unavailable",
            null,
            true,
            "Official TTC performance metrics are temporarily unavailable.",
            List.of()
        );
    }

    private record CachedPerformanceSnapshot(
        TtcPerformanceResponses.SnapshotResponse snapshot,
        OffsetDateTime attemptedAt
    ) {}
}
