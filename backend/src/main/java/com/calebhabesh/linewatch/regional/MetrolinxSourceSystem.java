package com.calebhabesh.linewatch.regional;

import java.util.List;

public final class MetrolinxSourceSystem {
    public static final String GO_SERVICE_ALERTS = "metrolinx-go-service-alerts";
    public static final String GO_INFORMATION_ALERTS = "metrolinx-go-information-alerts";
    public static final String GO_MARKETING_ALERTS = "metrolinx-go-marketing-alerts";
    public static final String GO_GTFS_ALERTS = "metrolinx-go-gtfs-alerts";
    public static final String GO_TRAIN_EXCEPTIONS = "metrolinx-go-train-exceptions";
    public static final String GO_GTFS_TRIP_UPDATES = "metrolinx-go-gtfs-trip-updates";
    public static final String UP_GTFS_ALERTS = "metrolinx-up-gtfs-alerts";

    private static final List<Descriptor> DESCRIPTORS = List.of(
        new Descriptor(GO_SERVICE_ALERTS, "GO service alerts", "rider-alert", true, false),
        new Descriptor(GO_INFORMATION_ALERTS, "GO information alerts", "rider-alert", false, false),
        new Descriptor(GO_MARKETING_ALERTS, "GO marketing alerts (retired)", "rider-alert", false, false),
        new Descriptor(GO_GTFS_ALERTS, "GO GTFS-RT alerts", "rider-alert", false, false),
        new Descriptor(GO_TRAIN_EXCEPTIONS, "GO train exceptions", "operational", false, true),
        new Descriptor(GO_GTFS_TRIP_UPDATES, "GO GTFS-RT trip updates", "operational", false, true),
        new Descriptor(UP_GTFS_ALERTS, "UP Express GTFS-RT alerts", "rider-alert", true, false)
    );

    private MetrolinxSourceSystem() {}

    public static List<Descriptor> descriptors() {
        return DESCRIPTORS;
    }

    public static boolean isOperational(String sourceSystem) {
        return DESCRIPTORS.stream()
            .anyMatch(descriptor -> descriptor.sourceSystem().equals(sourceSystem) && descriptor.operational());
    }

    public static boolean isRequired(String sourceSystem) {
        return DESCRIPTORS.stream()
            .anyMatch(descriptor -> descriptor.sourceSystem().equals(sourceSystem) && descriptor.required());
    }

    public record Descriptor(
        String sourceSystem,
        String label,
        String kind,
        boolean required,
        boolean operational
    ) {}
}
