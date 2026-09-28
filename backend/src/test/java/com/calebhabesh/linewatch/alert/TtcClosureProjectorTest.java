package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.calebhabesh.linewatch.alert.AlertActivePeriodRepository.AlertPeriod;
import com.calebhabesh.linewatch.alert.AlertDashboardService.ActiveAlertDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.PlannedClosureDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.SegmentImpact;
import com.calebhabesh.linewatch.alert.TtcClosureProjector.ClosureProjection;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class TtcClosureProjectorTest {

    private final TtcClosureProjector projector = new TtcClosureProjector();

    @Test
    void nullAndEmptyInputsHandledSafely() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        assertThat(projector.project(null, Map.of(), List.of(), now)).isEmpty();
        assertThat(projector.project(List.of(), Map.of(), List.of(), now)).isEmpty();

        AlertEntity closure = alert(
            "closure-1", "planned-closure", "planned",
            "Weekend closure", "No service.", "kipling", "islington",
            now.minusHours(1), null
        );
        withLine(closure, "line-2", "2");

        // Null periods and null segments handled gracefully
        List<ClosureProjection> projections = projector.project(List.of(closure), null, null, now);
        assertThat(projections).hasSize(1);
        assertThat(projections.getFirst().canonicalClosure().id()).isEqualTo("closure-1");

        // Null evaluation times throw NullPointerException
        assertThatThrownBy(() -> projector.project(List.of(closure), Map.of(), List.of(), (OffsetDateTime) null))
            .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> projector.project(List.of(closure), Map.of(), List.of(), (Instant) null))
            .isInstanceOf(NullPointerException.class);
    }

    @Test
    void exactParentPeriodMatchingResolvesActiveChildAlert() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity parentClosure = withLine(alert(
            "planned-closure-parent",
            "planned-closure",
            "planned",
            "Nightly closure parent",
            "There will be no subway service nightly between St George and Sheppard West.",
            "st-george",
            "sheppard-west",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            "shuttle-bus"
        ), "line-1", "1");
        ReflectionTestUtils.setField(parentClosure, "activePeriodStart", OffsetDateTime.parse("2026-06-01T04:00:00Z"));
        ReflectionTestUtils.setField(parentClosure, "activePeriodEnd", OffsetDateTime.parse("2026-06-05T09:00:00Z"));

        AlertEntity currentClosure = withLine(alert(
            "planned-closure-current-window",
            "planned-closure",
            "planned",
            "There is no subway service between St George and Sheppard West",
            "Shuttle buses are running between St George and Sheppard West.",
            "st-george",
            "sheppard-west",
            OffsetDateTime.parse("2026-06-01T11:55:00Z"),
            "shuttle-bus"
        ), "line-1", "1");
        ReflectionTestUtils.setField(currentClosure, "activePeriodStart", OffsetDateTime.parse("2026-06-01T11:00:00Z"));
        ReflectionTestUtils.setField(currentClosure, "activePeriodEnd", OffsetDateTime.parse("2026-06-01T13:00:00Z"));

        List<LineSegmentEntity> segments = List.of(
            segment("line-1-st-george-sheppard-west", "line-1", "st-george", "sheppard-west", 10)
        );

        AlertPeriod parentChildPeriod = new AlertPeriod(
            "planned-closure-parent",
            "planned-closure-current-window",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T13:00:00Z"),
            0
        );
        AlertPeriod currentWindowPeriod = new AlertPeriod(
            "planned-closure-current-window",
            "parent",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T13:00:00Z"),
            0
        );

        Map<String, List<AlertPeriod>> periods = Map.of(
            "planned-closure-parent", List.of(parentChildPeriod),
            "planned-closure-current-window", List.of(currentWindowPeriod)
        );

        List<ClosureProjection> projections = projector.project(
            List.of(parentClosure, currentClosure),
            periods,
            segments,
            now
        );

        assertThat(projections).singleElement().satisfies(proj -> {
            assertThat(proj.canonicalClosure().id()).isEqualTo("planned-closure-parent");
            assertThat(proj.activeNow()).isTrue();
            assertThat(proj.canonicalClosure().timingStatus()).isEqualTo("active-now");

            // Presentation inherits active child operational title and updated time
            assertThat(proj.activePresentation().title())
                .isEqualTo("There is no subway service between St George and Sheppard West");
            assertThat(proj.activePresentation().updatedAt())
                .isEqualTo(OffsetDateTime.parse("2026-06-01T11:55:00Z"));

            // Active closure alert links child id to parent planned closure
            ActiveAlertDto activeAlert = proj.activeClosureAlert();
            assertThat(activeAlert).isNotNull();
            assertThat(activeAlert.id()).isEqualTo("planned-closure-current-window");
            assertThat(activeAlert.relatedPlannedClosureId()).isEqualTo("planned-closure-parent");
            assertThat(activeAlert.title()).isEqualTo("There is no subway service between St George and Sheppard West");
            assertThat(activeAlert.severity()).isEqualTo("planned");
            assertThat(activeAlert.affectedSegmentIds()).containsExactly("line-1-st-george-sheppard-west");
            assertThat(activeAlert.shuttle()).isTrue();
            assertThat(activeAlert.source()).isEqualTo("TTC Service Advisory");
            assertThat(activeAlert.startedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:00:00Z"));
            assertThat(activeAlert.updatedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:55:00Z"));

            // Impacts use child alert cardId
            List<Map.Entry<String, SegmentImpact>> impacts = proj.activeSegmentImpacts();
            assertThat(impacts).singleElement().satisfies(entry -> {
                assertThat(entry.getKey()).isEqualTo("line-1-st-george-sheppard-west");
                assertThat(entry.getValue().kind()).isEqualTo("suspension");
                assertThat(entry.getValue().cardId()).isEqualTo("planned-closure-current-window");
                assertThat(entry.getValue().sourceAlertIds()).containsExactly("planned-closure-current-window");
            });
        });
    }

    @Test
    void standaloneChildAlertWithoutParentPeriodRemainsStandaloneClosure() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity closure = withLine(alert(
            "standalone-closure",
            "planned-closure",
            "planned",
            "No service between Jane and Ossington",
            "Shuttle buses operating.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            "shuttle-bus"
        ), "line-2", "2");
        ReflectionTestUtils.setField(closure, "activePeriodStart", OffsetDateTime.parse("2026-06-01T11:00:00Z"));
        ReflectionTestUtils.setField(closure, "activePeriodEnd", OffsetDateTime.parse("2026-06-01T14:00:00Z"));

        List<LineSegmentEntity> segments = List.of(
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 20)
        );

        AlertPeriod period = new AlertPeriod(
            "standalone-closure",
            "window-1",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T14:00:00Z"),
            0
        );

        List<ClosureProjection> projections = projector.project(
            List.of(closure),
            Map.of("standalone-closure", List.of(period)),
            segments,
            now
        );

        assertThat(projections).singleElement().satisfies(proj -> {
            assertThat(proj.canonicalClosure().id()).isEqualTo("standalone-closure");
            assertThat(proj.activeNow()).isTrue();
            assertThat(proj.activeClosureAlert().relatedPlannedClosureId()).isNull();
            assertThat(proj.activeClosureAlert().id()).isEqualTo("standalone-closure");
            assertThat(proj.activeSegmentImpacts()).singleElement().satisfies(entry -> {
                assertThat(entry.getValue().cardId()).isEqualTo("standalone-closure");
            });
        });
    }

    @Test
    void projectedChildAlertLinkedToParentDoesNotAppearAsDuplicateTopLevelClosure() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity parent = withLine(alert(
            "parent-closure", "planned-closure", "planned",
            "Nightly closure", "Details...", "st-george", "sheppard-west",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(parent, "activePeriodStart", OffsetDateTime.parse("2026-06-01T04:00:00Z"));
        ReflectionTestUtils.setField(parent, "activePeriodEnd", OffsetDateTime.parse("2026-06-05T09:00:00Z"));

        AlertEntity child = withLine(alert(
            "child-alert", "planned-closure", "planned",
            "Active child window", "Details...", "st-george", "sheppard-west",
            OffsetDateTime.parse("2026-06-01T11:30:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(child, "activePeriodStart", OffsetDateTime.parse("2026-06-01T11:00:00Z"));
        ReflectionTestUtils.setField(child, "activePeriodEnd", OffsetDateTime.parse("2026-06-01T13:00:00Z"));

        AlertEntity upcoming = withLine(alert(
            "upcoming-closure", "planned-closure", "planned",
            "Weekend closure", "Details...", "jane", "ossington",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"), null
        ), "line-2", "2");
        ReflectionTestUtils.setField(upcoming, "activePeriodStart", OffsetDateTime.parse("2026-06-02T04:00:00Z"));
        ReflectionTestUtils.setField(upcoming, "activePeriodEnd", OffsetDateTime.parse("2026-06-03T04:00:00Z"));

        AlertPeriod parentChildPeriod = new AlertPeriod(
            "parent-closure", "child-alert",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T13:00:00Z"), 0
        );

        Map<String, List<AlertPeriod>> periods = Map.of(
            "parent-closure", List.of(parentChildPeriod),
            "child-alert", List.of(new AlertPeriod(
                "child-alert", "parent",
                OffsetDateTime.parse("2026-06-01T11:00:00Z"),
                OffsetDateTime.parse("2026-06-01T13:00:00Z"), 0
            )),
            "upcoming-closure", List.of(new AlertPeriod(
                "upcoming-closure", "window-0",
                OffsetDateTime.parse("2026-06-02T04:00:00Z"),
                OffsetDateTime.parse("2026-06-03T04:00:00Z"), 0
            ))
        );

        List<ClosureProjection> projections = projector.project(
            List.of(parent, child, upcoming),
            periods,
            List.of(),
            now
        );

        // child-alert is filtered out from top-level projections because it's linked to parent-closure
        assertThat(projections).extracting(ClosureProjection::id)
            .containsExactly("parent-closure", "upcoming-closure");
    }

    @Test
    void temporalBoundariesStartAndEndInstants() {
        OffsetDateTime windowStart = OffsetDateTime.parse("2026-06-01T11:00:00Z");
        OffsetDateTime windowEnd = OffsetDateTime.parse("2026-06-01T13:00:00Z");

        AlertEntity closure = withLine(alert(
            "closure-boundary", "planned-closure", "planned",
            "Boundary test closure", "Boundary test", "finch", "eglinton",
            OffsetDateTime.parse("2026-06-01T10:00:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(closure, "activePeriodStart", windowStart);
        ReflectionTestUtils.setField(closure, "activePeriodEnd", windowEnd.plusDays(1));

        AlertPeriod period = new AlertPeriod(
            "closure-boundary", "period-0",
            windowStart, windowEnd, 0
        );
        Map<String, List<AlertPeriod>> periods = Map.of("closure-boundary", List.of(period));
        List<LineSegmentEntity> segments = List.of();

        // 1 ms before start: upcoming, not activeNow
        OffsetDateTime oneMsBeforeStart = windowStart.minusNanos(1_000_000);
        List<ClosureProjection> beforeStart = projector.project(List.of(closure), periods, segments, oneMsBeforeStart);
        assertThat(beforeStart.getFirst().activeNow()).isFalse();
        assertThat(beforeStart.getFirst().canonicalClosure().timingStatus()).isEqualTo("upcoming");
        assertThat(beforeStart.getFirst().canonicalClosure().nextWindowStart()).isEqualTo(windowStart);

        // Exact start instant: activeNow == true
        List<ClosureProjection> atStart = projector.project(List.of(closure), periods, segments, windowStart);
        assertThat(atStart.getFirst().activeNow()).isTrue();
        assertThat(atStart.getFirst().canonicalClosure().timingStatus()).isEqualTo("active-now");
        assertThat(atStart.getFirst().canonicalClosure().activeWindowStart()).isEqualTo(windowStart);
        assertThat(atStart.getFirst().canonicalClosure().activeWindowEnd()).isEqualTo(windowEnd);

        // 1 ms before end: activeNow == true
        OffsetDateTime oneMsBeforeEnd = windowEnd.minusNanos(1_000_000);
        List<ClosureProjection> beforeEnd = projector.project(List.of(closure), periods, segments, oneMsBeforeEnd);
        assertThat(beforeEnd.getFirst().activeNow()).isTrue();
        assertThat(beforeEnd.getFirst().canonicalClosure().timingStatus()).isEqualTo("active-now");

        // Exact end instant: activeNow == false (closed)
        List<ClosureProjection> atEnd = projector.project(List.of(closure), periods, segments, windowEnd);
        assertThat(atEnd.getFirst().activeNow()).isFalse();
        assertThat(atEnd.getFirst().canonicalClosure().timingStatus()).isEqualTo("unknown");

        // 1 ms after end: activeNow == false
        OffsetDateTime oneMsAfterEnd = windowEnd.plusNanos(1_000_000);
        List<ClosureProjection> afterEnd = projector.project(List.of(closure), periods, segments, oneMsAfterEnd);
        assertThat(afterEnd.getFirst().activeNow()).isFalse();
        assertThat(afterEnd.getFirst().canonicalClosure().timingStatus()).isEqualTo("unknown");
    }

    @Test
    void alertLevelExpirationBoundaryEvaluatesCorrectly() {
        OffsetDateTime alertEnd = OffsetDateTime.parse("2026-06-05T09:00:00Z");

        AlertEntity closure = withLine(alert(
            "closure-expiration", "planned-closure", "planned",
            "Expiring closure", "Testing expiration boundary", "finch", "eglinton",
            OffsetDateTime.parse("2026-06-01T10:00:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(closure, "activePeriodStart", OffsetDateTime.parse("2026-06-01T10:00:00Z"));
        ReflectionTestUtils.setField(closure, "activePeriodEnd", alertEnd);

        AlertPeriod period = new AlertPeriod(
            "closure-expiration", "period-0",
            OffsetDateTime.parse("2026-06-01T10:00:00Z"),
            alertEnd, 0
        );
        Map<String, List<AlertPeriod>> periods = Map.of("closure-expiration", List.of(period));

        // Exact alertEnd instant: alert is still current (endsAt == null || !endsAt.isBefore(evaluationTime))
        List<ClosureProjection> atAlertEnd = projector.project(List.of(closure), periods, List.of(), alertEnd);
        assertThat(atAlertEnd).hasSize(1);

        // 1 ms after alertEnd: alert is expired and filtered out
        List<ClosureProjection> afterAlertEnd = projector.project(
            List.of(closure), periods, List.of(), alertEnd.plusNanos(1_000_000)
        );
        assertThat(afterAlertEnd).isEmpty();
    }

    @Test
    void nightlyClosureEvaluatesOverlappingWindowsAndFormatsHoursAndDates() {
        // Toronto time: UTC-4 in June. 2026-06-01T18:00:00Z is 2:00 PM EDT (daytime between nightly windows)
        OffsetDateTime afternoon = OffsetDateTime.parse("2026-06-01T18:00:00Z");

        AlertEntity nightlyAlert = withLine(alert(
            "nightly-closure", "planned-closure", "planned",
            "Nightly closure between Finch and Eglinton",
            "No subway service nightly between Finch and Eglinton starting at 11 p.m.",
            "finch", "eglinton",
            OffsetDateTime.parse("2026-06-01T10:00:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(nightlyAlert, "activePeriodStart", OffsetDateTime.parse("2026-06-01T04:00:00Z"));
        ReflectionTestUtils.setField(nightlyAlert, "activePeriodEnd", OffsetDateTime.parse("2026-06-04T10:00:00Z"));

        // Window 1: June 1, 11:00 PM EDT (June 2, 03:00 UTC) to June 2, 06:00 AM EDT (10:00 UTC)
        AlertPeriod window1 = new AlertPeriod(
            "nightly-closure", "w1",
            OffsetDateTime.parse("2026-06-02T03:00:00Z"),
            OffsetDateTime.parse("2026-06-02T10:00:00Z"), 0
        );
        // Window 2: June 2, 11:00 PM EDT (June 3, 03:00 UTC) to June 3, 06:00 AM EDT (10:00 UTC)
        AlertPeriod window2 = new AlertPeriod(
            "nightly-closure", "w2",
            OffsetDateTime.parse("2026-06-03T03:00:00Z"),
            OffsetDateTime.parse("2026-06-03T10:00:00Z"), 1
        );

        Map<String, List<AlertPeriod>> periods = Map.of("nightly-closure", List.of(window1, window2));

        // Evaluated during the afternoon: upcoming next window
        List<ClosureProjection> afternoonProjections = projector.project(
            List.of(nightlyAlert), periods, List.of(), afternoon
        );
        assertThat(afternoonProjections).singleElement().satisfies(proj -> {
            PlannedClosureDto dto = proj.canonicalClosure();
            assertThat(dto.nightly()).isTrue();
            assertThat(dto.activeNow()).isFalse();
            assertThat(dto.timingStatus()).isEqualTo("upcoming");
            assertThat(dto.nextWindowStart()).isEqualTo(OffsetDateTime.parse("2026-06-02T03:00:00Z"));
            assertThat(dto.nextWindowEnd()).isEqualTo(OffsetDateTime.parse("2026-06-02T10:00:00Z"));
            assertThat(dto.windowHours()).isEqualTo("11:00 PM – 6:00 AM");
            assertThat(dto.windowDates()).isEqualTo("Mon, Jun 1 – Tue, Jun 2");
        });

        // Evaluated at 1:00 AM EDT during window 1 (June 2, 05:00 UTC): active-now
        OffsetDateTime nightTime = OffsetDateTime.parse("2026-06-02T05:00:00Z");
        List<ClosureProjection> nightProjections = projector.project(
            List.of(nightlyAlert), periods, List.of(), nightTime
        );
        assertThat(nightProjections).singleElement().satisfies(proj -> {
            PlannedClosureDto dto = proj.canonicalClosure();
            assertThat(dto.activeNow()).isTrue();
            assertThat(dto.timingStatus()).isEqualTo("active-now");
            assertThat(dto.activeWindowStart()).isEqualTo(OffsetDateTime.parse("2026-06-02T03:00:00Z"));
            assertThat(dto.activeWindowEnd()).isEqualTo(OffsetDateTime.parse("2026-06-02T10:00:00Z"));
            assertThat(dto.window()).isEqualTo("Nightly closure windows");
        });
    }

    @Test
    void varyingClosureHoursReflectsInWindowHours() {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-23T12:00:00Z");

        AlertEntity closure = withLine(alert(
            "late-opening-varies", "planned-closure", "planned",
            "Line 2 late openings", "Service will start late.", "st-george", "chester",
            OffsetDateTime.parse("2026-08-20T14:00:00Z"), "Will Operate"
        ), "line-2", "2");

        AlertPeriod window1 = new AlertPeriod(
            "late-opening-varies", "w1",
            OffsetDateTime.parse("2026-08-23T12:07:00Z"),
            OffsetDateTime.parse("2026-08-23T15:00:00Z"), 0
        );
        AlertPeriod window2 = new AlertPeriod(
            "late-opening-varies", "w2",
            OffsetDateTime.parse("2026-08-24T10:05:00Z"),
            OffsetDateTime.parse("2026-08-24T15:00:00Z"), 1
        );

        List<ClosureProjection> projections = projector.project(
            List.of(closure),
            Map.of("late-opening-varies", List.of(window1, window2)),
            List.of(),
            now
        );

        assertThat(projections).singleElement().satisfies(proj -> {
            assertThat(proj.canonicalClosure().windowHours()).isEqualTo("Varies by closure date");
            assertThat(proj.canonicalClosure().nightly()).isFalse();
        });
    }

    @Test
    void restorationAlertsFilteredFromPlannedClosuresAndChildAlerts() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity closure = withLine(alert(
            "real-closure", "planned-closure", "planned",
            "Weekend closure", "Details...", "lawrence-west", "st-george",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"), "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(closure, "activePeriodEnd", OffsetDateTime.parse("2026-06-02T08:00:00Z"));

        AlertEntity restoration = withLine(alert(
            "restoration-alert", "planned-closure", "planned",
            "Regular service has resumed between Lawrence West and St George stations.", "",
            "lawrence-west", "st-george",
            OffsetDateTime.parse("2026-06-01T11:30:00Z"), "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(restoration, "effect", "NO_EFFECT");
        ReflectionTestUtils.setField(restoration, "effectDescription", "Regular service");
        ReflectionTestUtils.setField(restoration, "activePeriodEnd", OffsetDateTime.parse("2026-06-01T12:15:00Z"));

        List<ClosureProjection> projections = projector.project(
            List.of(closure, restoration),
            Map.of(),
            List.of(),
            now
        );

        assertThat(projections).extracting(ClosureProjection::id)
            .containsExactly("real-closure");
    }

    @Test
    void endedEarlyChildRemovesCompletedWeekendClosureFromCurrentService() {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-27T17:00:00Z");
        OffsetDateTime start = OffsetDateTime.parse("2026-09-26T03:59:00Z");
        OffsetDateTime scheduledEnd = OffsetDateTime.parse("2026-09-28T04:00:00Z");

        AlertEntity parent = withLine(alert(
            "weekend-parent", "planned-closure", "planned",
            "Line 1 full weekend closure", "Shuttle buses replace service.",
            "finch", "sheppard-yonge", start, "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(parent, "activePeriodStart", start);
        ReflectionTestUtils.setField(parent, "activePeriodEnd", scheduledEnd);

        AlertEntity child = withLine(alert(
            "weekend-child", "planned-closure", "planned",
            "Line 1 – ENDED EARLY - Finch to Sheppard-Yonge – Full weekend closure",
            "Subway service will be replaced by shuttle buses until Sunday.",
            "finch", "sheppard-yonge", now.minusMinutes(5), "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(child, "activePeriodStart", start);
        ReflectionTestUtils.setField(child, "activePeriodEnd", scheduledEnd);

        Map<String, List<AlertPeriod>> periods = Map.of(
            "weekend-parent", List.of(new AlertPeriod(
                "weekend-parent", "weekend-child", start, scheduledEnd, 0
            )),
            "weekend-child", List.of(new AlertPeriod(
                "weekend-child", "parent", start, scheduledEnd, 0
            ))
        );
        List<LineSegmentEntity> segments = List.of(
            segment("finch-sheppard-yonge", "line-1", "finch", "sheppard-yonge", 0)
        );

        assertThat(projector.project(List.of(parent, child), periods, segments, now)).isEmpty();
    }

    @Test
    void endedEarlyNightlyOccurrenceKeepsLaterScheduledWindow() {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-27T17:00:00Z");
        OffsetDateTime start = OffsetDateTime.parse("2026-09-27T04:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-09-27T21:00:00Z");
        OffsetDateTime nextStart = OffsetDateTime.parse("2026-09-28T04:00:00Z");
        OffsetDateTime nextEnd = OffsetDateTime.parse("2026-09-28T09:00:00Z");

        AlertEntity parent = withLine(alert(
            "nightly-parent", "planned-closure", "planned",
            "Nightly planned closure", "Shuttles operate nightly.",
            "finch", "sheppard-yonge", now.minusDays(1), "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(parent, "activePeriodStart", start);
        ReflectionTestUtils.setField(parent, "activePeriodEnd", nextEnd);
        AlertEntity child = withLine(alert(
            "nightly-child", "planned-closure", "planned",
            "Line 1 – ENDED EARLY - nightly closure", "Service will resume tonight.",
            "finch", "sheppard-yonge", now.minusMinutes(5), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(child, "activePeriodStart", start);
        ReflectionTestUtils.setField(child, "activePeriodEnd", end);

        List<ClosureProjection> projections = projector.project(
            List.of(parent, child),
            Map.of("nightly-parent", List.of(
                new AlertPeriod("nightly-parent", "nightly-child", start, end, 0),
                new AlertPeriod("nightly-parent", "next-child", nextStart, nextEnd, 1)
            )),
            List.of(),
            now
        );

        assertThat(projections).singleElement().satisfies(projection -> {
            assertThat(projection.activeNow()).isFalse();
            assertThat(projection.activeClosureAlert()).isNull();
            assertThat(projection.activeSegmentImpacts()).isEmpty();
            assertThat(projection.canonicalClosure().timingStatus()).isEqualTo("upcoming");
            assertThat(projection.canonicalClosure().nextWindowStart()).isEqualTo(nextStart);
        });
    }

    @Test
    void endedEarlyStandaloneClosureAndParentAreNotPublished() {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-27T17:00:00Z");
        OffsetDateTime end = now.plusHours(12);
        AlertEntity standalone = withLine(alert(
            "standalone", "planned-closure", "planned",
            "ENDED EARLY - Line 1 full weekend closure", "Closure was scheduled through Sunday.",
            "finch", "sheppard-yonge", now.minusMinutes(5), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(standalone, "activePeriodEnd", end);
        AlertEntity parent = withLine(alert(
            "parent", "planned-closure", "planned",
            "Line 1 – ENDED EARLY - full weekend closure", "Closure was scheduled through Sunday.",
            "finch", "sheppard-yonge", now.minusMinutes(5), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(parent, "activePeriodEnd", end);

        assertThat(projector.project(List.of(standalone), Map.of(), List.of(), now)).isEmpty();
        AlertEntity child = withLine(alert(
            "child", "planned-closure", "planned", "Weekend closure", "Shuttles operate.",
            "finch", "sheppard-yonge", now.minusHours(1), "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(child, "activePeriodEnd", end);
        assertThat(projector.project(List.of(parent, child), Map.of(
            "parent", List.of(new AlertPeriod("parent", "child", now.minusHours(1), end, 0))
        ), List.of(), now)).isEmpty();
    }

    @Test
    void malformedAndPublicationEnvelopeWindowsFiltered() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity closure = withLine(alert(
            "malformed-closure", "planned-closure", "planned",
            "Service start by 4 p.m.", "Shuttles...", "finch-west", "humber-college",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"), "Will Operate"
        ), "line-6", "6");
        ReflectionTestUtils.setField(closure, "activePeriodStart", OffsetDateTime.parse("2026-06-01T11:45:00Z"));
        ReflectionTestUtils.setField(closure, "activePeriodEnd", OffsetDateTime.parse("2026-06-04T04:00:00Z"));

        AlertPeriod publicationEnvelope = new AlertPeriod(
            "malformed-closure", "parent",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            OffsetDateTime.parse("2026-06-04T04:00:00Z"), 0
        );
        AlertPeriod openEndedChild = new AlertPeriod(
            "malformed-closure", "child-open",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"), null, 1
        );
        AlertPeriod missingStart = new AlertPeriod(
            "malformed-closure", "child-no-start",
            null, OffsetDateTime.parse("2026-06-01T13:00:00Z"), 2
        );
        AlertPeriod reversedWindow = new AlertPeriod(
            "malformed-closure", "child-reversed",
            OffsetDateTime.parse("2026-06-01T13:00:00Z"),
            OffsetDateTime.parse("2026-06-01T11:00:00Z"), 3
        );

        List<ClosureProjection> projections = projector.project(
            List.of(closure),
            Map.of("malformed-closure", List.of(publicationEnvelope, openEndedChild, missingStart, reversedWindow)),
            List.of(),
            now
        );

        assertThat(projections).singleElement().satisfies(proj -> {
            PlannedClosureDto dto = proj.canonicalClosure();
            assertThat(dto.activeNow()).isFalse();
            assertThat(dto.timingStatus()).isEqualTo("unknown");
            assertThat(dto.window()).isEqualTo("Closure timing unavailable");
            assertThat(proj.activeClosureAlert()).isNull();
            assertThat(proj.activeSegmentImpacts()).isEmpty();
        });
    }

    @Test
    void directionAndOrderingAcrossLinesAndSegments() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity closureLine4 = withLine(alert(
            "closure-l4", "planned-closure", "planned",
            "Line 4 closure", "Details", "sheppard-yonge", "don-mills",
            now.minusHours(1), null
        ), "line-4", "4");
        ReflectionTestUtils.setField(closureLine4, "direction", "Both ways");
        ReflectionTestUtils.setField(closureLine4, "activePeriodStart", now.plusDays(1));
        ReflectionTestUtils.setField(closureLine4, "activePeriodEnd", now.plusDays(2));

        AlertEntity closureLine1 = withLine(alert(
            "closure-l1", "planned-closure", "planned",
            "Line 1 closure", "Details", "finch", "eglinton",
            now.minusHours(1), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(closureLine1, "direction", "Northbound");
        ReflectionTestUtils.setField(closureLine1, "activePeriodStart", now.plusDays(1));
        ReflectionTestUtils.setField(closureLine1, "activePeriodEnd", now.plusDays(2));

        AlertEntity closureLine2 = withLine(alert(
            "closure-l2", "planned-closure", "planned",
            "Line 2 closure", "Details", "kipling", "jane",
            now.minusHours(1), null
        ), "line-2", "2");
        ReflectionTestUtils.setField(closureLine2, "direction", null);
        ReflectionTestUtils.setField(closureLine2, "activePeriodStart", now.plusDays(1));
        ReflectionTestUtils.setField(closureLine2, "activePeriodEnd", now.plusDays(2));

        List<LineSegmentEntity> segments = List.of(
            segment("line-1-finch-eglinton", "line-1", "finch", "eglinton", 10, "northbound"),
            segment("line-2-kipling-jane", "line-2", "kipling", "jane", 20),
            segment("line-4-sheppard-don-mills", "line-4", "sheppard-yonge", "don-mills", 30)
        );

        List<PlannedClosureDto> ordered = projector.plannedClosures(
            List.of(closureLine4, closureLine1, closureLine2),
            Map.of(),
            segments,
            now
        );

        // Line 1 < Line 2 < Line 4
        assertThat(ordered).extracting(PlannedClosureDto::id)
            .containsExactly("closure-l1", "closure-l2", "closure-l4");

        // Direction verification: displayDirection retains human string (or null if unknown), travelDirection converts relative to segment forwardDirection
        assertThat(ordered.get(0).displayDirection()).isEqualTo("Northbound");
        assertThat(ordered.get(0).travelDirection()).isEqualTo("forward");
        assertThat(ordered.get(1).displayDirection()).isNull();
        assertThat(ordered.get(1).travelDirection()).isEqualTo("bidirectional");
        assertThat(ordered.get(2).displayDirection()).isEqualTo("Eastbound & Westbound");
        assertThat(ordered.get(2).travelDirection()).isEqualTo("bidirectional");
    }

    @Test
    void convenienceProjectionsFilterAndSortAppropriately() {
        OffsetDateTime now = OffsetDateTime.parse("2026-06-01T12:00:00Z");

        AlertEntity activeClosure = withLine(alert(
            "active-c", "planned-closure", "planned",
            "Active closure", "Details", "finch", "eglinton",
            now.minusHours(1), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(activeClosure, "activePeriodStart", now.minusHours(1));
        ReflectionTestUtils.setField(activeClosure, "activePeriodEnd", now.plusHours(2));

        AlertEntity upcomingClosure = withLine(alert(
            "upcoming-c", "planned-closure", "planned",
            "Upcoming closure", "Details", "kipling", "jane",
            now.minusHours(1), null
        ), "line-2", "2");
        ReflectionTestUtils.setField(upcomingClosure, "activePeriodStart", now.plusDays(1));
        ReflectionTestUtils.setField(upcomingClosure, "activePeriodEnd", now.plusDays(2));

        AlertPeriod activePeriod = new AlertPeriod(
            "active-c", "p1", now.minusHours(1), now.plusHours(2), 0
        );
        AlertPeriod upcomingPeriod = new AlertPeriod(
            "upcoming-c", "p2", now.plusDays(1), now.plusDays(2), 0
        );

        Map<String, List<AlertPeriod>> periods = Map.of(
            "active-c", List.of(activePeriod),
            "upcoming-c", List.of(upcomingPeriod)
        );

        List<LineSegmentEntity> segments = List.of(
            segment("line-1-finch-eglinton", "line-1", "finch", "eglinton", 10),
            segment("line-2-kipling-jane", "line-2", "kipling", "jane", 20)
        );

        List<PlannedClosureDto> allPlanned = projector.plannedClosures(
            List.of(upcomingClosure, activeClosure), periods, segments, now
        );
        assertThat(allPlanned).extracting(PlannedClosureDto::id)
            .containsExactly("active-c", "upcoming-c");

        List<PlannedClosureDto> activePlanned = projector.activePlannedClosures(
            List.of(upcomingClosure, activeClosure), periods, segments, now
        );
        assertThat(activePlanned).extracting(PlannedClosureDto::id)
            .containsExactly("active-c");

        List<ActiveAlertDto> activeAlerts = projector.activeClosureAlerts(
            List.of(upcomingClosure, activeClosure), periods, segments, now
        );
        assertThat(activeAlerts).extracting(ActiveAlertDto::id)
            .containsExactly("active-c");
    }

    @Test
    void instantOverloadWorksIdenticallyToOffsetDateTime() {
        Instant instant = Instant.parse("2026-06-01T12:00:00Z");
        OffsetDateTime offsetDateTime = instant.atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime();

        AlertEntity closure = withLine(alert(
            "c-instant", "planned-closure", "planned",
            "Weekend closure", "Details", "finch", "eglinton",
            offsetDateTime.minusHours(1), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(closure, "activePeriodStart", offsetDateTime.minusHours(1));
        ReflectionTestUtils.setField(closure, "activePeriodEnd", offsetDateTime.plusHours(2));

        AlertPeriod period = new AlertPeriod(
            "c-instant", "p1", offsetDateTime.minusHours(1), offsetDateTime.plusHours(2), 0
        );
        Map<String, List<AlertPeriod>> periods = Map.of("c-instant", List.of(period));

        List<ClosureProjection> fromInstant = projector.project(List.of(closure), periods, List.of(), instant);
        List<ClosureProjection> fromOffset = projector.project(List.of(closure), periods, List.of(), offsetDateTime);

        assertThat(fromInstant).hasSize(1);
        assertThat(fromOffset).hasSize(1);
        assertThat(fromInstant.getFirst().canonicalClosure().id())
            .isEqualTo(fromOffset.getFirst().canonicalClosure().id());
        assertThat(fromInstant.getFirst().activeNow())
            .isEqualTo(fromOffset.getFirst().activeNow());
    }

    // Helper methods for constructing test fixtures

    private AlertEntity alert(
        String id,
        String type,
        String severity,
        String title,
        String description,
        String startStationId,
        String endStationId,
        OffsetDateTime sourceUpdatedAt,
        String shuttleType
    ) {
        AlertEntity alert = new AlertEntity();
        ReflectionTestUtils.setField(alert, "id", id);
        ReflectionTestUtils.setField(alert, "sourceId", id);
        ReflectionTestUtils.setField(alert, "line", new TransitLineEntity(
            "line-2",
            "2",
            "Bloor-Danforth",
            "#00923F",
            2
        ));
        ReflectionTestUtils.setField(alert, "type", type);
        ReflectionTestUtils.setField(alert, "severity", severity);
        ReflectionTestUtils.setField(alert, "title", title);
        ReflectionTestUtils.setField(alert, "description", description);
        ReflectionTestUtils.setField(alert, "active", true);
        ReflectionTestUtils.setField(alert, "impactKind", "planned-closure");
        ReflectionTestUtils.setField(alert, "startStationId", startStationId);
        ReflectionTestUtils.setField(alert, "endStationId", endStationId);
        if (sourceUpdatedAt != null) {
            ReflectionTestUtils.setField(alert, "activePeriodStart", sourceUpdatedAt.minusMinutes(5));
        }
        ReflectionTestUtils.setField(alert, "sourceUpdatedAt", sourceUpdatedAt);
        ReflectionTestUtils.setField(alert, "shuttleType", shuttleType);
        return alert;
    }

    private AlertEntity withLine(AlertEntity alert, String lineId, String lineNumber) {
        ReflectionTestUtils.setField(alert, "line", new TransitLineEntity(
            lineId,
            lineNumber,
            lineId,
            "#000",
            Integer.parseInt(lineNumber)
        ));
        return alert;
    }

    private LineSegmentEntity segment(
        String id,
        String lineId,
        String stationAId,
        String stationBId,
        int sortOrder
    ) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            "M 0 0 L 1 1",
            sortOrder
        );
    }

    private LineSegmentEntity segment(
        String id,
        String lineId,
        String stationAId,
        String stationBId,
        int sortOrder,
        String forwardDirection
    ) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            "M 0 0 L 1 1",
            sortOrder,
            forwardDirection,
            null,
            false,
            null,
            null
        );
    }
}
