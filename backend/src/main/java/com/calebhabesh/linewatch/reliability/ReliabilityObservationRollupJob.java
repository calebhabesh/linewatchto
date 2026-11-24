package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.reliability.ReliabilityObservationRollup.RollupResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rolls up polling coverage every 15 minutes. The roll-up writes every date without a final
 * row, so the first run after a deploy (2 minutes after start) is also the backfill from the
 * oldest retained run, and a run after downtime catches up the dates it missed.
 */
@Component
@ConditionalOnProperty(
    prefix = "linewatch.reliability.observation-rollup",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true
)
public class ReliabilityObservationRollupJob {
    private static final Logger log = LoggerFactory.getLogger(ReliabilityObservationRollupJob.class);

    private final ReliabilityObservationRollup rollup;

    public ReliabilityObservationRollupJob(ReliabilityObservationRollup rollup) {
        this.rollup = rollup;
    }

    @Scheduled(
        initialDelayString = "${linewatch.reliability.observation-rollup.initial-delay:PT2M}",
        fixedDelayString = "${linewatch.reliability.observation-rollup.fixed-delay:PT15M}"
    )
    public void rollUp() {
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            try {
                RollupResult result = rollup.rollUp(networkId);
                // Today and yesterday are routine; more is a backfill or a catch-up.
                if (result.datesRolledUp() > 2) {
                    log.info("Reliability observation roll-up wrote {} dates for {}", result.datesRolledUp(), networkId);
                }
            } catch (RuntimeException exception) {
                log.error("Reliability observation roll-up failed for {}", networkId, exception);
            }
        }
    }
}
