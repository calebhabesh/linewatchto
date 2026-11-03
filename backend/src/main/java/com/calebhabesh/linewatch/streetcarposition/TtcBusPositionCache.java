package com.calebhabesh.linewatch.streetcarposition;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** The last successfully indexed bus read. A failed read leaves it in place; freshness is judged on read. */
@Component
public class TtcBusPositionCache {
    private final AtomicReference<TtcBusPositionSnapshot> snapshot = new AtomicReference<>();

    public Optional<TtcBusPositionSnapshot> get() {
        return Optional.ofNullable(snapshot.get());
    }

    public void replace(TtcBusPositionSnapshot value) {
        snapshot.set(value);
    }
}
