package com.calebhabesh.linewatch.arrival.schedule;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GtfsScheduleRefreshRunService {
    private final GtfsScheduleRefreshRunStore store;
    private final Clock clock;

    public GtfsScheduleRefreshRunService(GtfsScheduleRefreshRunStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long start() {
        return store.createRunning(OffsetDateTime.now(clock));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeed(long id, GtfsScheduleImportService.ImportSummary summary) {
        store.markSuccess(id, OffsetDateTime.now(clock), summary.stopTimes());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(long id, Throwable failure) {
        String message = failure.getMessage();
        if (message == null) {
            message = failure.getClass().getName();
        }
        if (message.length() > 1000) {
            message = message.substring(0, 1000);
        }
        store.markFailed(id, OffsetDateTime.now(clock), message);
    }

    public Optional<GtfsScheduleRefreshRunSnapshot> latest() {
        return store.findLatest();
    }
}
