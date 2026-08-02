package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

public record UpTripUpdateFeed(
    OffsetDateTime sourceUpdatedAt,
    List<Trip> trips
) {
    public Optional<Trip> findTrip(String sourceTripId) {
        String requested = normalizedTripId(sourceTripId);
        if (requested.isBlank()) return Optional.empty();

        List<Trip> exact = trips.stream()
            .filter(trip -> normalizedTripId(trip.tripId()).equals(requested))
            .toList();
        if (exact.size() == 1) return Optional.of(exact.getFirst());

        String requestedServiceTrip = serviceTripId(requested);
        List<Trip> aliases = trips.stream()
            .filter(trip -> serviceTripId(normalizedTripId(trip.tripId())).equals(requestedServiceTrip))
            .toList();
        return aliases.size() == 1 ? Optional.of(aliases.getFirst()) : Optional.empty();
    }

    private static String normalizedTripId(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.CANADA);
    }

    private static String serviceTripId(String value) {
        return value.replaceFirst("^\\d{8}[-_]", "");
    }

    public record Trip(
        String tripId,
        String vehicleId,
        boolean inbound,
        String direction,
        String destination,
        List<StopTime> stopTimes
    ) {
        public Optional<StopTime> stopTime(String stopCode) {
            if (stopCode == null) return Optional.empty();
            String requested = stopCode.trim();
            return stopTimes.stream()
                .filter(stop -> stop.stopCode().equalsIgnoreCase(requested))
                .findFirst();
        }
    }

    public record StopTime(
        String stopCode,
        OffsetDateTime scheduledAt,
        OffsetDateTime predictedAt
    ) {}
}
