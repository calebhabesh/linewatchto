package com.calebhabesh.linewatch.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

class DashboardCacheServiceTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final DashboardCacheProperties properties = new DashboardCacheProperties();
    private final DashboardCacheService cache = new DashboardCacheService(redis, new ObjectMapper().findAndRegisterModules(), properties);

    @Test
    void returnsCachedValueOnHit() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn("[\"cached\"]");

        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("cached");
        verify(values, never()).set(eq("linewatch:dashboard:v1:test"), any(String.class), any(Duration.class));
    }

    @Test
    void computesAndStoresOnMiss() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn(null);

        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("computed");
        verify(values).set(eq("linewatch:dashboard:v1:test"), eq("[\"computed\"]"), eq(Duration.ofSeconds(30)));
    }

    @Test
    void ignoresCachedValuesRejectedByPredicate() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn("[]");

        List<String> result = cache.getOrComputeIf(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            value -> !value.isEmpty(),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("computed");
        verify(values).set(eq("linewatch:dashboard:v1:test"), eq("[\"computed\"]"), eq(Duration.ofSeconds(30)));
    }

    @Test
    void doesNotStoreComputedValuesRejectedByPredicate() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn(null);

        List<String> result = cache.getOrComputeIf(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            value -> !value.isEmpty(),
            List::of
        );

        assertThat(result).isEmpty();
        verify(values, never()).set(eq("linewatch:dashboard:v1:test"), any(String.class), any(Duration.class));
    }

    @Test
    void failsOpenWhenRedisIsUnavailable() {
        when(redis.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));
        AtomicInteger calls = new AtomicInteger();

        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> {
                calls.incrementAndGet();
                return List.of("computed");
            }
        );

        assertThat(result).containsExactly("computed");
        assertThat(calls).hasValue(1);
    }

    @Test
    void bypassesRedisWhenDisabled() {
        properties.setEnabled(false);
        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("computed");
        verify(redis, never()).opsForValue();
    }
}
