package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.Map;

public record GoTrainCoachCountFeed(
    OffsetDateTime sourceUpdatedAt,
    Map<String, Integer> coachCountsByTripNumber
) {
}
