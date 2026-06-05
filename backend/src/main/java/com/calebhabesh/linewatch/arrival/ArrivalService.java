package com.calebhabesh.linewatch.arrival;

import com.calebhabesh.linewatch.arrival.schedule.ScheduledArrivalProvider;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ArrivalService implements ArrivalProvider {
    private final ScheduledArrivalProvider scheduledArrivalProvider;
    private final ArrivalProperties properties;
    private final Clock clock;

    public ArrivalService(
        ScheduledArrivalProvider scheduledArrivalProvider,
        ArrivalProperties properties,
        Clock clock
    ) {
        this.scheduledArrivalProvider = scheduledArrivalProvider;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public List<ArrivalPrediction> arrivalsFor(String stationId, List<StationResponses.StationLineResponse> lines) {
        return switch (properties.getProvider()) {
            case SCHEDULED -> scheduledArrivalProvider.arrivalsFor(stationId, lines);
            case DEMO -> getDemoPredictions(lines);
            case UNAVAILABLE, LIVE -> getUnavailablePredictions(lines);
        };
    }

    private List<ArrivalPrediction> getDemoPredictions(List<StationResponses.StationLineResponse> lines) {
        List<ArrivalPrediction> predictions = new ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now(clock);
        for (StationResponses.StationLineResponse line : lines) {
            predictions.add(ArrivalPrediction.demo(line.id(), "Northbound / Eastbound", 2, now));
            predictions.add(ArrivalPrediction.demo(line.id(), "Southbound / Westbound", 5, now));
        }
        return predictions;
    }

    private List<ArrivalPrediction> getUnavailablePredictions(List<StationResponses.StationLineResponse> lines) {
        List<ArrivalPrediction> predictions = new ArrayList<>();
        for (StationResponses.StationLineResponse line : lines) {
            predictions.add(ArrivalPrediction.unavailable(line.id(), "Northbound / Eastbound"));
            predictions.add(ArrivalPrediction.unavailable(line.id(), "Southbound / Westbound"));
        }
        return predictions;
    }
}
