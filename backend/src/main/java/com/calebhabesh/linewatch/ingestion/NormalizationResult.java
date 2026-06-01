package com.calebhabesh.linewatch.ingestion;

import java.util.Optional;

public record NormalizationResult<T>(
    NormalizationStatus status,
    Optional<T> projection
) {
    public static <T> NormalizationResult<T> matched(T projection) {
        return new NormalizationResult<>(NormalizationStatus.MATCHED, Optional.of(projection));
    }

    public static <T> NormalizationResult<T> matchedWithUnresolved(T projection) {
        return new NormalizationResult<>(
            NormalizationStatus.MATCHED_WITH_UNRESOLVED,
            Optional.of(projection)
        );
    }

    public static <T> NormalizationResult<T> ignored() {
        return new NormalizationResult<>(NormalizationStatus.IGNORED, Optional.empty());
    }

    public static <T> NormalizationResult<T> unmatched() {
        return new NormalizationResult<>(NormalizationStatus.UNMATCHED, Optional.empty());
    }

    public boolean shouldPersist() {
        return status == NormalizationStatus.MATCHED
            || status == NormalizationStatus.MATCHED_WITH_UNRESOLVED;
    }

    public boolean countsAsUnmatched() {
        return status == NormalizationStatus.UNMATCHED
            || status == NormalizationStatus.MATCHED_WITH_UNRESOLVED;
    }
}
