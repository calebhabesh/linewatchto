package com.calebhabesh.linewatch.surfacearrival;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class TtcSurfaceArrivalCache {
    private final Map<String, TtcSurfaceArrivalSnapshot> snapshots = new ConcurrentHashMap<>();

    public Optional<TtcSurfaceArrivalSnapshot> get(String mode) {
        return Optional.ofNullable(snapshots.get(mode));
    }

    public void replace(TtcSurfaceArrivalSnapshot snapshot) {
        snapshots.put(snapshot.mode(), snapshot);
    }
}
