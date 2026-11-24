package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DeriveResult;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ScheduleSource;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Property-triggered runner that rebuilds the reliability read model for a target methodology
 * version from the first analyzable date through yesterday, switches
 * {@code reliability_methodology} atomically, and cleans up obsolete versions.
 */
@Component
public class ReliabilityRebuildRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ReliabilityRebuildRunner.class);

    private final boolean enabled;
    private final int targetVersion;
    private final ReliabilityScheduleCapture scheduleCapture;
    private final ReliabilityObservationRollup observationRollup;
    private final ReliabilityDerivationService derivationService;

    public ReliabilityRebuildRunner(
        @Value("${linewatch.reliability.rebuild.enabled:false}") boolean enabled,
        @Value("${linewatch.reliability.rebuild.target-version:2}") int targetVersion,
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        ReliabilityDerivationService derivationService
    ) {
        this.enabled = enabled;
        this.targetVersion = targetVersion;
        this.scheduleCapture = scheduleCapture;
        this.observationRollup = observationRollup;
        this.derivationService = derivationService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        log.info("Starting reliability read-model rebuild for methodology version {}", targetVersion);
        for (ScheduleSource source : ScheduleSource.values()) {
            scheduleCapture.capture(source);
        }
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            observationRollup.rollUp(networkId);
        }
        List<DeriveResult> results = derivationService.rebuildAndSwitch(targetVersion);
        for (DeriveResult result : results) {
            log.info(
                "Reliability rebuild v{} {} completed {}..{} (episodes={} lineDays={} stationDays={} durationMs={})",
                result.methodologyVersion(), result.networkId(), result.fromDate(), result.toDate(),
                result.episodesUpserted(), result.lineDaysWritten(), result.stationDaysWritten(), result.durationMs()
            );
        }
    }
}
