package com.calebhabesh.linewatch.alert;

import java.util.Locale;

/** Public bucket names. Wire keys also identify persisted preferences and lifecycles. */
public final class AlertCategoryLabels {
    private AlertCategoryLabels() {}

    public static String singular(String kind) {
        return switch (key(kind)) {
            case "suspension", "active-alert" -> "Suspension";
            case "delay" -> "Delay";
            case "limited-service" -> "Limited service";
            case "reduced-speed-zone", "rsz" -> "Reduced Speed Zone";
            case "planned-closure", "closure" -> "Planned Advisory";
            case "trip-cancellation", "cancellation" -> "Train Cancellation";
            default -> "Service Alert";
        };
    }

    public static String plural(String kind) {
        return switch (key(kind)) {
            case "suspension", "active-alert" -> "Suspensions";
            case "delay", "limited-service" -> "Delays";
            case "reduced-speed-zone", "rsz" -> "Reduced Speed Zones";
            case "planned-closure", "closure" -> "Planned Advisories";
            case "trip-cancellation", "cancellation" -> "Train Cancellations";
            default -> "Service Notices";
        };
    }

    private static String key(String kind) {
        return kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
