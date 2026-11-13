package com.calebhabesh.linewatch.ingestion;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Contains provider-record failures within one ingestion run. Each unit of work runs in its own
 * savepoint; a unit that throws is undone and set aside (quarantined) with its kind, source ID and
 * cause, and the run carries on with the rest of the feed. Callers keep a quarantined record's
 * last-good rows active instead of reading the failure as a clearance.
 *
 * <p>More than {@value #MAX_QUARANTINED_ITEMS} quarantined items, or as many as half the provider
 * records attempted, means something broader than one malformed record is wrong (schema,
 * normalizer, provider format), so {@link #failIfTooMany(int)} fails the run and the dashboard
 * stops claiming freshness.
 */
public final class IngestionRecordIsolation {
    static final int MAX_QUARANTINED_ITEMS = 10;
    private static final Logger log = LoggerFactory.getLogger(IngestionRecordIsolation.class);

    private final String network;
    private final IngestionSavepoints savepoints;
    private final List<QuarantinedRecord> quarantined = new ArrayList<>();

    public IngestionRecordIsolation(String network, IngestionSavepoints savepoints) {
        this.network = network;
        this.savepoints = savepoints;
    }

    /** Runs the work; returns false when it failed and was quarantined. */
    public boolean run(String kind, String sourceId, Runnable work) {
        try {
            savepoints.run(work);
            return true;
        } catch (RuntimeException failure) {
            QuarantinedRecord record = QuarantinedRecord.of(kind, sourceId, failure);
            quarantined.add(record);
            log.warn("Quarantined {} {} {} for this run: {}", network, kind, record.sourceId(), record.message(), failure);
            return false;
        }
    }

    /** Returns the work's (non-null) result, or null when the record was quarantined. */
    public <T> T compute(String kind, String sourceId, Supplier<T> work) {
        List<T> holder = new ArrayList<>(1);
        boolean ok = run(kind, sourceId, () -> holder.add(Objects.requireNonNull(
            work.get(), () -> kind + " produced no result")));
        return ok ? holder.getFirst() : null;
    }

    /** Sets a record aside without attempting it (for example, it has no usable ID). */
    public void reject(String kind, String sourceId, String reason) {
        String label = sourceId == null || sourceId.isBlank()
            ? "unknown"
            : sourceId.strip().length() > 40 ? sourceId.strip().substring(0, 40) + "…" : sourceId.strip();
        QuarantinedRecord record = new QuarantinedRecord(kind, label, reason);
        quarantined.add(record);
        log.warn("Quarantined {} {} {} for this run: {}", network, kind, record.sourceId(), reason);
    }

    public void failIfTooMany(int attempted) {
        int count = quarantined.size();
        if (count > MAX_QUARANTINED_ITEMS || (count > 0 && count * 2 >= attempted)) {
            QuarantinedRecord first = quarantined.getFirst();
            throw new IllegalStateException(
                network + " ingestion quarantined " + count + " items from " + attempted
                    + " provider records; first: " + first.label() + ": " + first.message()
            );
        }
    }

    public List<QuarantinedRecord> quarantined() {
        return List.copyOf(quarantined);
    }
}
