package com.calebhabesh.linewatch.regional;

import java.util.Locale;
import java.util.regex.Pattern;

/** Explicit timetable announcements, not generic disruption or closure notices. */
final class RegionalScheduleAnnouncement {
    private static final Pattern TITLE = Pattern.compile(
        "^(?:service changes?|schedule changes?|new schedules?) (?:start|begin|effective|from)\\b"
    );
    private static final Pattern DAY_SCHEDULE_TITLE = Pattern.compile(
        "^(?:(?:we|trains) (?:are|will be) |go transit (?:is|will be) )?"
            + "(?:running|operating) (?:on )?(?:a |an |the )?"
            + "(?:saturday|sunday|weekday|weekend|holiday) schedule\\b"
    );

    static boolean matches(String title, String description) {
        String normalizedTitle = title.strip().toLowerCase(Locale.CANADA).replaceAll("\\s+", " ");
        // The subject must announce the timetable. A closure's description can also
        // mention a replacement bus schedule without making the closure informational.
        return DAY_SCHEDULE_TITLE.matcher(normalizedTitle).find()
            || TITLE.matcher(normalizedTitle).find()
            && description.toLowerCase(Locale.CANADA).matches(
                "(?s).*(?:weekday|weekend|timetable|schedule|train service).*");
    }

    private RegionalScheduleAnnouncement() {}
}
