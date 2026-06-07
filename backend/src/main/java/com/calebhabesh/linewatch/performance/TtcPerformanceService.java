package com.calebhabesh.linewatch.performance;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TtcPerformanceService {
    private final TtcPerformanceClient client;
    private final TtcPerformanceProperties properties;

    public TtcPerformanceService(TtcPerformanceClient client, TtcPerformanceProperties properties) {
        this.client = client;
        this.properties = properties;
    }

    public TtcPerformanceResponses.SnapshotResponse current() {
        if (!properties.isEnabled()) {
            return new TtcPerformanceResponses.SnapshotResponse(
                "disabled",
                "TTC.ca",
                properties.getUrl().toString(),
                "On-time performance and elevator/escalator status",
                "Disabled",
                null,
                true,
                "Official TTC performance metrics are disabled in this environment.",
                List.of()
            );
        }

        try {
            return client.fetch();
        } catch (RuntimeException exception) {
            return new TtcPerformanceResponses.SnapshotResponse(
                "unavailable",
                "TTC.ca",
                properties.getUrl().toString(),
                "On-time performance and elevator/escalator status",
                "Unavailable",
                null,
                true,
                "Official TTC performance metrics are temporarily unavailable.",
                List.of()
            );
        }
    }
}
