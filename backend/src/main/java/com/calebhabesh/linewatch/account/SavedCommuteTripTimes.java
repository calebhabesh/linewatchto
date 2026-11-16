package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Whether upcoming planned work meets a commute leg's trip times: the leg's days and start-to-end
 * minutes (SavedCommuteNotificationSchedule). My Commutes and commute pushes share this rule.
 *
 * <ul>
 *   <li>A listed window that meets the trip times puts the work on the leg. The first such window
 *   is the occurrence pushes announce and remind about.</li>
 *   <li>A complete list with no such window is outside the trip times: shown muted, never pushed.</li>
 *   <li>A partial list with no such window is not pushed yet (a later listed window may meet the
 *   trip), but the dashboard does not call it outside.</li>
 *   <li>With no windows known, pushes fall back to whether the work starts inside the trip times
 *   (for a GO/UP date-only notice, whether its service days include a trip day).</li>
 * </ul>
 *
 * Only upcoming planned work is judged; what is in effect now, and delays and suspensions with no
 * dependable end, always count.
 */
public final class SavedCommuteTripTimes {
    private SavedCommuteTripTimes() {}

    /** The earliest listed window that meets the leg's trip times. */
    public static Optional<CommuteResponses.ServiceWindow> firstMeetingWindow(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match
    ) {
        return listedWindows(match).stream()
            .filter(window -> meets(commute, legId, window))
            .min(Comparator.comparing(CommuteResponses.ServiceWindow::startsAt));
    }

    /** Upcoming work whose complete window list misses every trip occurrence on this leg. */
    public static boolean outside(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match
    ) {
        CommuteResponses.ServiceWindows windows = upcomingWindows(match);
        return windows != null
            && windows.complete()
            && !windows.windows().isEmpty()
            && windows.windows().stream().allMatch(window -> window.startsAt() != null)
            && firstMeetingWindow(commute, legId, match).isEmpty();
    }

    /** Whether a push about this upcoming work may go out for this leg. */
    public static boolean pushRelevant(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match
    ) {
        if (!listedWindows(match).isEmpty()) {
            return firstMeetingWindow(commute, legId, match).isPresent();
        }
        if (match.eventStartAt() == null) {
            return true;
        }
        // A GO/UP date-only window compares service days rather than its midnight start.
        if (match.notificationServiceEndAt() != null) {
            return SavedCommuteNotificationSchedule.overlapsServiceDates(
                commute, legId, match.eventStartAt(), match.notificationServiceEndAt());
        }
        return SavedCommuteNotificationSchedule.matches(commute, legId, match.eventStartAt().toInstant());
    }

    static boolean meets(SavedCommuteEntity commute, String legId, CommuteResponses.ServiceWindow window) {
        if (window.datesOnly()) {
            // A date-only window with no end has no stated last day; treat it as running on.
            return SavedCommuteNotificationSchedule.overlapsServiceDates(
                commute, legId, window.startsAt(),
                window.endsAt() == null ? window.startsAt().plusYears(2) : window.endsAt()
            );
        }
        return SavedCommuteNotificationSchedule.overlaps(
            commute, legId, window.startsAt(),
            window.endsAt() == null ? window.startsAt().plusYears(2) : window.endsAt()
        );
    }

    private static List<CommuteResponses.ServiceWindow> listedWindows(CommuteResponses.MatchedImpactResponse match) {
        CommuteResponses.ServiceWindows windows = upcomingWindows(match);
        return windows == null ? List.of() : windows.windows().stream()
            .filter(window -> window.startsAt() != null)
            .toList();
    }

    private static CommuteResponses.ServiceWindows upcomingWindows(CommuteResponses.MatchedImpactResponse match) {
        return match == null || !"planned".equals(match.status()) ? null : match.serviceWindows();
    }
}
