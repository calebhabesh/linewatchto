package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * GO GTFS-RT TripUpdates reduced to what train markers need: each running
 * trip's predicted stop times. Trip IDs match the VehiclePosition feed's
 * the same way UP trips do (exact, then the service trip without its date).
 */
public record GoTripUpdateFeed(
    OffsetDateTime sourceUpdatedAt,
    List<Trip> trips
) {
    public Optional<Trip> findTrip(String sourceTripId) {
        String requested = UpTripUpdateFeed.normalizedTripId(sourceTripId);
        if (requested.isBlank()) return Optional.empty();
        List<Trip> exact = trips.stream()
            .filter(trip -> UpTripUpdateFeed.normalizedTripId(trip.tripId()).equals(requested))
            .toList();
        if (exact.size() == 1) return Optional.of(exact.getFirst());
        String requestedServiceTrip = UpTripUpdateFeed.serviceTripId(requested);
        List<Trip> aliases = trips.stream()
            .filter(trip -> UpTripUpdateFeed.serviceTripId(UpTripUpdateFeed.normalizedTripId(trip.tripId()))
                .equals(requestedServiceTrip))
            .toList();
        return aliases.size() == 1 ? Optional.of(aliases.getFirst()) : Optional.empty();
    }

    public record Trip(String tripId, List<UpTripUpdateFeed.StopTime> stopTimes) {
        public Optional<UpTripUpdateFeed.StopTime> stopTime(String stopCode) {
            if (stopCode == null) return Optional.empty();
            String requested = stopCode.trim();
            return stopTimes.stream()
                .filter(stop -> stop.stopCode().equalsIgnoreCase(requested))
                .findFirst();
        }
    }
}
