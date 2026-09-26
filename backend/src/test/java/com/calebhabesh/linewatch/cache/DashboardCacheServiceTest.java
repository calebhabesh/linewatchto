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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
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

    @Test
    void sharesOneComputationAcrossConcurrentCacheMisses() throws Exception {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn(null);

        CountDownLatch secondCallerJoined = new CountDownLatch(1);
        DashboardCacheService synchronizedCache = new DashboardCacheService(redis, new ObjectMapper().findAndRegisterModules(), properties) {
            @Override
            void onInFlightJoined(String redisKey) {
                secondCallerJoined.countDown();
            }
        };

        AtomicInteger computations = new AtomicInteger();
        CountDownLatch computationStarted = new CountDownLatch(1);
        CountDownLatch releaseComputation = new CountDownLatch(1);
        Supplier<List<String>> supplier = () -> {
            computations.incrementAndGet();
            computationStarted.countDown();
            try {
                if (!releaseComputation.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test computation was not released");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            }
            return List.of("computed");
        };

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<List<String>> first = executor.submit(() -> synchronizedCache.getOrCompute(
                "test", new TypeReference<List<String>>() {}, Duration.ofSeconds(30), supplier
            ));
            assertThat(computationStarted.await(5, TimeUnit.SECONDS)).isTrue();
            Future<List<String>> second = executor.submit(() -> synchronizedCache.getOrCompute(
                "test", new TypeReference<List<String>>() {}, Duration.ofSeconds(30), supplier
            ));
            assertThat(secondCallerJoined.await(5, TimeUnit.SECONDS)).isTrue();

            releaseComputation.countDown();

            assertThat(first.get(5, TimeUnit.SECONDS)).containsExactly("computed");
            assertThat(second.get(5, TimeUnit.SECONDS)).containsExactly("computed");
            assertThat(computations).hasValue(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void clearsSingleFlightEntryAfterComputationFailure() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn(null);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> { throw new IllegalStateException("failed"); }
        )).isInstanceOf(IllegalStateException.class);

        List<String> recovered = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("recovered")
        );

        assertThat(recovered).containsExactly("recovered");
    }
}
