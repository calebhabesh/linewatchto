package com.calebhabesh.linewatch.ingestion;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IngestionRunService {
    private static final int MAX_ERROR_LENGTH = 1000;

    private final IngestionRunStore store;
    private final Clock clock;

    public IngestionRunService(IngestionRunStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long start() {
        return store.createRunning(now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeed(
        long id,
        FeedApplicationCounts counts,
        OffsetDateTime sourceFeedUpdatedAt
    ) {
        succeed(id, counts, sourceFeedUpdatedAt, TtcSubwayClosureSnapshot.unavailable());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeed(
        long id,
        FeedApplicationCounts counts,
        OffsetDateTime sourceFeedUpdatedAt,
        TtcSubwayClosureSnapshot subwayClosures
    ) {
        store.markSuccess(id, now(), counts, sourceFeedUpdatedAt, subwayClosures);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(long id, Throwable failure) {
        String message = failure.getMessage() == null
            ? failure.getClass().getSimpleName()
            : failure.getMessage();
        store.markFailed(id, now(), message.substring(0, Math.min(message.length(), MAX_ERROR_LENGTH)));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }
}
