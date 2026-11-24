package com.calebhabesh.linewatch.alert;

import java.util.Locale;

/** Public bucket names. Wire keys also identify persisted preferences and lifecycles. */
public final class AlertCategoryLabels {
    public static final String CLASS_SERVICE_STOPPED = "service-stopped";
    public static final String CLASS_DELAY = "delay";
    public static final String CLASS_SLOW_ZONE = "slow-zone";
    public static final String CLASS_OTHER = "service-alert";

    private AlertCategoryLabels() {}

    public static String singular(String kind) {
        return switch (key(kind)) {
            case "suspension", "active-alert" -> "Suspension";
            case "delay" -> "Delay";
            case "limited-service" -> "Limited Service";
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

    /** Maps a normalized impact kind to its reliability methodology v2 disruption class key. */
    public static String disruptionClass(String kind) {
        return switch (key(kind)) {
            case "suspension", "active-alert", "closure", "planned-closure" -> CLASS_SERVICE_STOPPED;
            case "delay", "limited-service" -> CLASS_DELAY;
            case "reduced-speed-zone", "rsz" -> CLASS_SLOW_ZONE;
            default -> CLASS_OTHER;
        };
    }

    /** Title Case public label for a reliability methodology v2 disruption class key. */
    public static String disruptionClassLabel(String disruptionClass) {
        return switch (key(disruptionClass)) {
            case CLASS_SERVICE_STOPPED -> "Service Stopped";
            case CLASS_DELAY -> "Delays";
            case CLASS_SLOW_ZONE -> "Slow Zones";
            default -> "Service Alerts";
        };
    }

    public static boolean isPlannedImpactKind(String kind) {
        return "planned-closure".equals(key(kind));
    }

    private static String key(String kind) {
        return kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
