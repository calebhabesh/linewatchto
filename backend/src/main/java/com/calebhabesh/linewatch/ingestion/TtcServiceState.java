package com.calebhabesh.linewatch.ingestion;

import java.util.Locale;
import java.util.regex.Pattern;

public final class TtcServiceState {
    // Match TTC's editorial status label, not prose about subway service ending early.
    private static final Pattern ENDED_EARLY_STATUS = Pattern.compile(
        "(?:^|[-–—:])\\s*ended early\\s*(?:[-–—:]|$)",
        Pattern.CASE_INSENSITIVE
    );

    private TtcServiceState() {}

    public static boolean hasEndedEarlyStatus(String title) {
        return title != null && ENDED_EARLY_STATUS.matcher(title).find();
    }

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
        if (hasEndedEarlyStatus(title)) {
            return true;
        }
        String text = String.join(" ",
            nullToEmpty(title),
            nullToEmpty(description),
            nullToEmpty(effectDescription)
        ).toLowerCase(Locale.ROOT);
        return text.contains("service has resumed")
            || text.contains("service is restored")
            || text.contains("regular service")
            || text.contains("delays have cleared")
            || text.contains("delays are cleared")
            || text.contains("delays cleared")
            || text.contains("no delays");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
