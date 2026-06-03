package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;

public record RawAlertDto(
    String sourceSection,
    String sourceId,
    String routeType,
    OffsetDateTime sourceUpdatedAt,
    String payload,
    boolean active
) {}
