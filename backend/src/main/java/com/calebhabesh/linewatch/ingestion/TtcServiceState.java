package com.calebhabesh.linewatch.ingestion;

import java.util.Locale;

public final class TtcServiceState {
    private TtcServiceState() {}

    public static boolean isRestoration(NormalizedRouteAlert alert) {
        return alert != null && isRestoration(
            alert.effect(),
            alert.severity(),
            alert.title(),
            alert.description(),
            alert.effectDescription()
        );
    }

    public static boolean isRestoration(
        String effect,
        String severity,
        String title,
        String description,
        String effectDescription
    ) {
        if ("NO_EFFECT".equalsIgnoreCase(effect)
            || "Regular".equalsIgnoreCase(severity)) {
            return true;
        }
        String text = String.join(" ",
            nullToEmpty(title),
            nullToEmpty(description),
            nullToEmpty(effectDescription)
        ).toLowerCase(Locale.ROOT);
        return text.contains("service has resumed")
            || text.contains("service is restored")
            || text.contains("regular service");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
