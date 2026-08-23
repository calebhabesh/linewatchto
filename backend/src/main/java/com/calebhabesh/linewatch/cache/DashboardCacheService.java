package com.calebhabesh.linewatch.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Predicate;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class DashboardCacheService {
    private static final Logger log = LoggerFactory.getLogger(DashboardCacheService.class);
    private static final String PREFIX = "linewatch:dashboard:v1:";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final DashboardCacheProperties properties;
    private final ConcurrentMap<String, CompletableFuture<Object>> inFlight = new ConcurrentHashMap<>();

    public DashboardCacheService(
        StringRedisTemplate redis,
        ObjectMapper objectMapper,
        DashboardCacheProperties properties
    ) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public <T> T getOrCompute(String key, TypeReference<T> type, Duration ttl, Supplier<T> supplier) {
        return getOrComputeIf(key, type, ttl, value -> true, supplier);
    }

    public <T> T getOrComputeIf(
        String key,
        TypeReference<T> type,
        Duration ttl,
        Predicate<T> shouldCache,
        Supplier<T> supplier
    ) {
        if (!properties.isEnabled() || ttl == null || ttl.isNegative() || ttl.isZero()) {
            return supplier.get();
        }
        String redisKey = PREFIX + key;
        T cached = readCached(redisKey, type, shouldCache);
        if (cached != null) {
            return cached;
        }

        CompletableFuture<Object> computation = new CompletableFuture<>();
        CompletableFuture<Object> existing = inFlight.putIfAbsent(redisKey, computation);
        if (existing != null) {
            return await(existing);
        }

        try {
            // The cache may have been populated between the first read and winning
            // the in-process single-flight slot.
            cached = readCached(redisKey, type, shouldCache);
            if (cached != null) {
                computation.complete(cached);
                return cached;
            }

            T computed = supplier.get();
            if (shouldCache.test(computed)) {
                try {
                    redis.opsForValue().set(
                        redisKey,
                        objectMapper.writeValueAsString(computed),
                        ttl
                    );
                } catch (Exception exception) {
                    log.warn("Dashboard cache write failed for key {}", redisKey, exception);
                }
            }
            computation.complete(computed);
            return computed;
        } catch (RuntimeException | Error failure) {
            computation.completeExceptionally(failure);
            throw failure;
        } finally {
            inFlight.remove(redisKey, computation);
        }
    }

    private <T> T readCached(
        String redisKey,
        TypeReference<T> type,
        Predicate<T> shouldCache
    ) {
        try {
            String cached = redis.opsForValue().get(redisKey);
            if (cached == null || cached.isBlank()) {
                return null;
            }
            T value = objectMapper.readValue(cached, type);
            return value != null && shouldCache.test(value) ? value : null;
        } catch (Exception exception) {
            log.warn("Dashboard cache read failed for key {}", redisKey, exception);
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private <T> T await(CompletableFuture<Object> computation) {
        try {
            return (T) computation.join();
        } catch (CompletionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            if (cause instanceof Error error) {
                throw error;
            }
            throw new IllegalStateException("Dashboard cache computation failed", cause);
        }
    }

    public void evictDashboard() {
        if (!properties.isEnabled()) {
            return;
        }
        try {
            Set<String> keys = redis.keys(PREFIX + "*");
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
        } catch (Exception exception) {
            log.warn("Dashboard cache eviction failed", exception);
        }
    }
}
