package com.calebhabesh.linewatch.ingestion;

import java.util.List;

public record TtcSubwayClosureSnapshot(
    boolean available,
    List<TtcFetchedRecord> records
) {
    public TtcSubwayClosureSnapshot {
        records = records == null ? List.of() : List.copyOf(records);
    }

    public static TtcSubwayClosureSnapshot unavailable() {
        return new TtcSubwayClosureSnapshot(false, List.of());
    }
}
