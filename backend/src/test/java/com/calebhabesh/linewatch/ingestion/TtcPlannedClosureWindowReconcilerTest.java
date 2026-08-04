package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcPlannedClosureWindowReconcilerTest {

    @Test
    void repairsOnlyThePeriodWhoseStandaloneChildBecameARestoration() {
        NormalizedRouteAlert parent = plannedClosure(
            "73253",
            "REDUCED_SERVICE",
            "Nightly planned closure",
            List.of(
                period("73254", "2026-08-04T05:00:00Z", "2026-08-04T05:24:44.85Z", 0),
                period("73255", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 1),
                period("73256", "2026-08-06T05:00:00Z", "2026-08-06T07:30:00Z", 2)
            )
        );
        NormalizedRouteAlert restoration = plannedClosure(
            "73254",
            "NO_EFFECT",
            "Regular service has resumed between Lawrence West and St George stations.",
            List.of(period(
                "parent",
                "2026-08-04T05:24:44.85Z",
                "2026-08-04T05:39:44.85Z",
                0
            ))
        );

        List<NormalizedRouteAlert> reconciled =
            TtcPlannedClosureWindowReconciler.reconcile(
                List.of(parent, restoration),
                OffsetDateTime.parse("2026-08-04T05:26:00Z")
            );

        assertThat(reconciled.getFirst().periods()).containsExactly(
            period("73254", "2026-08-04T05:00:00Z", "2026-08-04T07:30:00Z", 0),
            period("73255", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 1),
            period("73256", "2026-08-06T05:00:00Z", "2026-08-06T07:30:00Z", 2)
        );
        assertThat(reconciled.get(1)).isEqualTo(restoration);
    }

    @Test
    void doesNotRewriteLegitimateShortWindowWithoutMatchingRestorationChild() {
        NormalizedRouteAlert parent = plannedClosure(
            "parent",
            "REDUCED_SERVICE",
            "Nightly planned closure",
            List.of(
                period("short-child", "2026-08-04T05:00:00Z", "2026-08-04T05:30:00Z", 0),
                period("future-child", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 1)
            )
        );

        assertThat(TtcPlannedClosureWindowReconciler.reconcile(
            List.of(parent),
            OffsetDateTime.parse("2026-08-04T05:10:00Z")
        ))
            .containsExactly(parent);
    }

    @Test
    void reconstructsMissingCurrentOccurrenceFromConsecutiveNightlyCadence() {
        NormalizedRouteAlert parent = plannedClosure(
            "73253",
            "REDUCED_SERVICE",
            "Nightly planned closure",
            List.of(
                period("73255", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 0),
                period("73256", "2026-08-06T05:00:00Z", "2026-08-06T07:30:00Z", 1)
            )
        );

        NormalizedRouteAlert reconciled = TtcPlannedClosureWindowReconciler.reconcile(
            List.of(parent),
            OffsetDateTime.parse("2026-08-04T05:55:00Z")
        ).getFirst();

        assertThat(reconciled.periods()).containsExactly(
            period(
                "derived-before-73255",
                "2026-08-04T05:00:00Z",
                "2026-08-04T07:30:00Z",
                -1
            ),
            period("73255", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 0),
            period("73256", "2026-08-06T05:00:00Z", "2026-08-06T07:30:00Z", 1)
        );
    }

    @Test
    void doesNotReconstructOccurrenceAfterItsCanonicalWindowEnds() {
        NormalizedRouteAlert parent = plannedClosure(
            "73253",
            "REDUCED_SERVICE",
            "Nightly planned closure",
            List.of(
                period("73255", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 0),
                period("73256", "2026-08-06T05:00:00Z", "2026-08-06T07:30:00Z", 1)
            )
        );

        assertThat(TtcPlannedClosureWindowReconciler.reconcile(
            List.of(parent),
            OffsetDateTime.parse("2026-08-04T07:31:00Z")
        )).containsExactly(parent);
    }

    @Test
    void doesNotReconstructOccurrenceBeforeItsCanonicalWindowStarts() {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-04T04:55:00Z");
        NormalizedRouteAlert parent = plannedClosure(
            "73253",
            "REDUCED_SERVICE",
            "Nightly planned closure",
            List.of(
                period("73255", "2026-08-05T05:00:00Z", "2026-08-05T07:30:00Z", 1),
                period("73256", "2026-08-06T05:00:00Z", "2026-08-06T07:30:00Z", 2)
            )
        );

        NormalizedRouteAlert reconciled = TtcPlannedClosureWindowReconciler.reconcile(
            List.of(parent),
            now
        ).getFirst();

        assertThat(reconciled.periods()).containsExactlyElementsOf(parent.periods());
    }

    private NormalizedRouteAlert plannedClosure(
        String sourceId,
        String effect,
        String title,
        List<NormalizedAlertPeriod> periods
    ) {
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-08-04T05:24:44.85Z");
        return new NormalizedRouteAlert(
            "ttc-route-" + sourceId,
            sourceId,
            "line-1",
            "planned-closure",
            "planned",
            title,
            "",
            "Planned",
            effect,
            "Subway Closure - Early Access",
            AlertDirection.BIDIRECTIONAL,
            "MAINTENANCE",
            "CLOSURE - Planned Track Work",
            null,
            AlertImpactKind.PLANNED_CLOSURE,
            null,
            null,
            null,
            null,
            null,
            "lawrence-west",
            "st-george",
            updatedAt.minusDays(10),
            updatedAt.plusDays(10),
            updatedAt,
            null,
            null,
            null,
            "{}",
            List.of("lawrence-west", "st-george"),
            periods,
            "fingerprint-" + sourceId
        );
    }

    private NormalizedAlertPeriod period(
        String sourcePeriodId,
        String startsAt,
        String endsAt,
        int sortOrder
    ) {
        return new NormalizedAlertPeriod(
            sourcePeriodId,
            OffsetDateTime.parse(startsAt),
            OffsetDateTime.parse(endsAt),
            sortOrder
        );
    }
}
