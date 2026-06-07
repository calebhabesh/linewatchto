package com.calebhabesh.linewatch.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Set;
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
        try {
            String cached = redis.opsForValue().get(redisKey);
            if (cached != null && !cached.isBlank()) {
                T value = objectMapper.readValue(cached, type);
                if (shouldCache.test(value)) {
                    return value;
                }
            }
        } catch (Exception exception) {
            log.warn("Dashboard cache read failed for key {}", redisKey, exception);
            return supplier.get();
        }

        T computed = supplier.get();
        if (!shouldCache.test(computed)) {
            return computed;
        }
        try {
            redis.opsForValue().set(redisKey, objectMapper.writeValueAsString(computed), ttl);
        } catch (Exception exception) {
            log.warn("Dashboard cache write failed for key {}", redisKey, exception);
        }
        return computed;
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
