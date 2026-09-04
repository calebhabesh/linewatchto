package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegionalIngestionRunService {
    private static final int MAX_ERROR_LENGTH = 1000;
    private final RegionalIngestionRunStore store;
    private final Clock clock;

    public RegionalIngestionRunService(RegionalIngestionRunStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long start() {
        return store.createRunning(now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeed(long id, FeedApplicationCounts counts, MetrolinxFeed feed) {
        store.markSuccess(id, now(), counts, feed.sourceUpdatedAt());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSourceStatuses(long id, MetrolinxFeed feed) {
        store.replaceSourceStatuses(id, feed);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSourceOutcomes(long id, Map<String, Boolean> sourceOutcomes) {
        store.recordSourceOutcomes(id, sourceOutcomes);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(long id, Throwable failure) {
        String message = failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage();
        store.markFailed(id, now(), message.substring(0, Math.min(message.length(), MAX_ERROR_LENGTH)));
    }

    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
