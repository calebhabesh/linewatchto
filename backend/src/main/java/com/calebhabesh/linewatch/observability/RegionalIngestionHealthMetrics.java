package com.calebhabesh.linewatch.observability;

import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionRunStore;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.stereotype.Component;

/**
 * GO/UP (Metrolinx) ingestion gauges, the regional counterpart of the TTC ingestion gauges in
 * {@link LinewatchHealthMetrics}. Gauges read NaN while Metrolinx ingestion is disabled or
 * unconfigured, so a deliberately off source never alerts.
 */
@Component
public class RegionalIngestionHealthMetrics implements MeterBinder {
    private final RegionalIngestionRunStore runStore;
    private final RegionalIngestionFreshness freshness;
    private final MetrolinxProperties properties;

    public RegionalIngestionHealthMetrics(
        RegionalIngestionRunStore runStore,
        RegionalIngestionFreshness freshness,
        MetrolinxProperties properties
    ) {
        this.runStore = runStore;
        this.freshness = freshness;
        this.properties = properties;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("linewatch_regional_ingestion_live", this, RegionalIngestionHealthMetrics::live)
            .description("Whether GO/UP data has a fresh successful Metrolinx ingestion run (NaN when disabled)")
            .register(registry);
        Gauge.builder("linewatch_regional_ingestion_records_quarantined", this, RegionalIngestionHealthMetrics::quarantined)
            .description("Metrolinx records the latest successful run set aside because they failed to persist")
            .register(registry);
    }

    private boolean active() {
        return properties.isEnabled() && properties.isConfigured();
    }

    double live() {
        return active() ? (freshness.isFresh() ? 1.0 : 0.0) : Double.NaN;
    }

    double quarantined() {
        return active()
            ? runStore.findLatestSuccessful().map(run -> (double) run.recordsQuarantined()).orElse(0.0)
            : Double.NaN;
    }
}
