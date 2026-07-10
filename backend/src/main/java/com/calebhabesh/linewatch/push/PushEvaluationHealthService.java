package com.calebhabesh.linewatch.push;

import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushEvaluationHealthService {
    private final PushEvaluationHealthRepository repository;
    private final Clock clock;

    public PushEvaluationHealthService(PushEvaluationHealthRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    public void record(PushNotificationDispatchService.PushEvaluationResult result) {
        Instant now = clock.instant();
        PushEvaluationHealthEntity health = repository.findById("current")
            .orElseGet(() -> PushEvaluationHealthEntity.current(now));
        health.record(result, now);
        repository.save(health);
    }

    @Transactional(readOnly = true)
    public PushEvaluationHealthEntity current() {
        return repository.findById("current").orElse(null);
    }
}
