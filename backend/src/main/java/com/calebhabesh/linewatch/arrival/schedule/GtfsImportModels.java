package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;

public final class GtfsImportModels {
    private GtfsImportModels() {
    }

    public record RouteRow(String routeId, String lineId, String shortName, String longName) {
    }

    public record StopRow(String stopId, String stopName, String parentStation) {
    }

    public record ServiceRow(
        String serviceId,
        boolean monday,
        boolean tuesday,
        boolean wednesday,
        boolean thursday,
        boolean friday,
        boolean saturday,
        boolean sunday,
        LocalDate startDate,
        LocalDate endDate
    ) {
    }

    public record ServiceExceptionRow(String serviceId, LocalDate serviceDate, int exceptionType) {
    }

    public record TripRow(
        String tripId,
        String routeId,
        String serviceId,
        String tripHeadsign,
        Integer directionId
    ) {
    }

    public record StopTimeRow(
        String tripId,
        String stopId,
        int arrivalSeconds,
        int departureSeconds,
        int stopSequence
    ) {
    }

    public record StationStopRow(String stationId, String lineId, String stopId) {
    }

    public record SurfaceRouteRow(
        String routeId,
        String shortName,
        String longName,
        String mode
    ) {
    }

    public record SurfaceStationStopRow(
        String stopId,
        String stationId,
        String stopName,
        String parentStation,
        String bayPlatform
    ) {
    }

    public record SurfaceTripRow(String tripId, String routeId, String tripHeadsign, String serviceId, int lastStopSequence) {
    }

    public record SurfaceStationConnectionRow(
        String stationId,
        String stopId,
        String routeId,
        String mode,
        String routeShortName,
        String routeLongName,
        String destination,
        String bayPlatform,
        String stopName
    ) {
    }
}
