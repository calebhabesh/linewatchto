package com.calebhabesh.linewatch.streetcarposition;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** The last successfully indexed read. A failed read leaves it in place; freshness is judged on read. */
@Component
public class TtcStreetcarPositionCache {
    private final AtomicReference<TtcStreetcarPositionSnapshot> snapshot = new AtomicReference<>();

    public Optional<TtcStreetcarPositionSnapshot> get() {
        return Optional.ofNullable(snapshot.get());
    }

    public void replace(TtcStreetcarPositionSnapshot value) {
        snapshot.set(value);
    }
}
