package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DerivationStatus;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DeriveResult;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ScheduleSource;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly job (04:30 America/Toronto, after service ends) that captures schedules (A1),
 * rolls up polling coverage (A3), and derives yesterday plus the trailing re-derive window
 * (14 days by default) into the reliability read model (A5). Also runs a lightweight catch-up
 * check after startup so a fresh deploy populates the read model without waiting until 04:30.
 */
@Component
@ConditionalOnProperty(
    prefix = "linewatch.reliability.derivation",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true
)
public class ReliabilityDerivationJob {
    private static final Logger log = LoggerFactory.getLogger(ReliabilityDerivationJob.class);
    private static final LocalTime NIGHTLY_CUTOFF = LocalTime.of(4, 30);

    private final ReliabilityScheduleCapture scheduleCapture;
    private final ReliabilityObservationRollup observationRollup;
    private final ReliabilityDerivationService derivationService;
    private final Clock clock;

    public ReliabilityDerivationJob(
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        ReliabilityDerivationService derivationService,
        Clock clock
    ) {
        this.scheduleCapture = scheduleCapture;
        this.observationRollup = observationRollup;
        this.derivationService = derivationService;
        this.clock = clock;
    }

    @Scheduled(cron = "${linewatch.reliability.derivation.cron:0 30 4 * * *}", zone = "America/Toronto")
    public void deriveNightly() {
        captureAndRollUp();
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            deriveNetwork(networkId);
        }
    }

    @Scheduled(
        initialDelayString = "${linewatch.reliability.derivation.startup-delay:PT3M}",
        fixedDelayString = "${linewatch.reliability.derivation.catchup-interval:PT6H}"
    )
    public void catchUpIfBehind() {
        ZonedDateTime nowToronto = ZonedDateTime.now(clock.withZone(GtfsServiceTime.TORONTO));
        LocalDate expectedThrough = nowToronto.toLocalTime().isBefore(NIGHTLY_CUTOFF)
            ? nowToronto.toLocalDate().minusDays(2)
            : nowToronto.toLocalDate().minusDays(1);
        int version = derivationService.currentMethodologyVersion();
        // On a fresh deployment where v1 has never derived yet, initialize straight onto the
        // latest methodology version via rebuildAndSwitch. Existing v1 databases remain on v1
        // until an explicit rebuildAndSwitch builds v2 beside v1 and switches atomically.
        if (version < ReliabilityDerivationService.LATEST_METHODOLOGY_VERSION
            && derivationService.derivationStatuses(version).stream().allMatch(s -> s.derivedThrough() == null)) {
            captureAndRollUp();
            derivationService.rebuildAndSwitch(ReliabilityDerivationService.LATEST_METHODOLOGY_VERSION);
            return;
        }
        boolean anyBehind = false;
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            Optional<DerivationStatus> status = derivationService.derivationStatus(version, networkId);
            LocalDate derivedThrough = status.map(DerivationStatus::derivedThrough).orElse(null);
            if (derivedThrough == null || derivedThrough.isBefore(expectedThrough)) {
                anyBehind = true;
                break;
            }
        }
        if (!anyBehind) return;
        captureAndRollUp();
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            Optional<DerivationStatus> status = derivationService.derivationStatus(version, networkId);
            LocalDate derivedThrough = status.map(DerivationStatus::derivedThrough).orElse(null);
            if (derivedThrough == null || derivedThrough.isBefore(expectedThrough)) {
                deriveNetwork(networkId);
            }
        }
    }

    private void captureAndRollUp() {
        for (ScheduleSource source : ScheduleSource.values()) {
            try {
                scheduleCapture.capture(source);
            } catch (RuntimeException exception) {
                log.error("Reliability schedule capture failed for {}", source, exception);
            }
        }
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            try {
                observationRollup.rollUp(networkId);
            } catch (RuntimeException exception) {
                log.error("Reliability observation roll-up failed for {}", networkId, exception);
            }
        }
    }

    private void deriveNetwork(String networkId) {
        try {
            DeriveResult result = derivationService.deriveIncremental(networkId);
            log.info(
                "Reliability derivation v{} {} derived {}..{} (episodes={} lineDays={} stationDays={} durationMs={})",
                result.methodologyVersion(), result.networkId(), result.fromDate(), result.toDate(),
                result.episodesUpserted(), result.lineDaysWritten(), result.stationDaysWritten(), result.durationMs()
            );
        } catch (RuntimeException exception) {
            log.error("Reliability derivation failed for {}", networkId, exception);
        }
    }
}
