package com.calebhabesh.linewatch.streetcarposition;

import java.time.OffsetDateTime;
import java.util.List;

/** The streetcar positions contract (S4) for buses (S8), with replacement buses marked. */
public final class BusPositionResponses {
    private BusPositionResponses() {
    }

    /**
     * {@code state}: live, stale, unavailable or disabled, as for streetcars. {@code vehicles} holds
     * only the buses inside the requested area when one was given.
     */
    public record PositionsResponse(
        String networkId,
        String state,
        String source,
        OffsetDateTime generatedAt,
        OffsetDateTime sourceUpdatedAt,
        long maxSourceAgeSeconds,
        long vehicleStaleAfterSeconds,
        long vehicleMaxAgeSeconds,
        long refreshSeconds,
        List<Vehicle> vehicles
    ) {
    }

    /** {@code ageSeconds} is measured on the server clock at {@code generatedAt}. */
    public record Vehicle(
        String vehicleId,
        String route,
        String routeName,
        String destination,
        double latitude,
        double longitude,
        Double bearing,
        OffsetDateTime reportedAt,
        long ageSeconds,
        boolean stale,
        boolean replacement
    ) {
    }

    /** An area to keep buses in: west, south, east, north (degrees). */
    public record Bounds(double west, double south, double east, double north) {
        /** "west,south,east,north" around Toronto; anything else is rejected. */
        public static Bounds parse(String value) {
            String[] parts = value.split(",", -1);
            if (parts.length != 4) throw new IllegalArgumentException("bbox needs west,south,east,north");
            double[] numbers = new double[4];
            for (int index = 0; index < 4; index++) {
                numbers[index] = Double.parseDouble(parts[index].strip());
                if (!Double.isFinite(numbers[index])) throw new IllegalArgumentException("bbox must be finite");
            }
            Bounds bounds = new Bounds(numbers[0], numbers[1], numbers[2], numbers[3]);
            if (bounds.west() >= bounds.east() || bounds.south() >= bounds.north()
                || bounds.west() < -81 || bounds.east() > -78 || bounds.south() < 43 || bounds.north() > 45) {
                throw new IllegalArgumentException("bbox must be an area around Toronto");
            }
            return bounds;
        }

        public boolean contains(double latitude, double longitude) {
            return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
        }
    }
}
