package com.calebhabesh.linewatch.regional;

import java.util.Locale;
import java.util.regex.Pattern;

/** Explicit timetable announcements, not generic disruption or closure notices. */
final class RegionalScheduleAnnouncement {
    private static final Pattern TITLE = Pattern.compile(
        "^(?:service changes?|schedule changes?|new schedules?) (?:start|begin|effective|from)\\b"
    );

    static boolean matches(String title, String description) {
        return TITLE.matcher(title.strip().toLowerCase(Locale.CANADA)).find()
            && description.toLowerCase(Locale.CANADA).matches(
                "(?s).*(?:weekday|weekend|timetable|schedule|train service).*");
    }

    private RegionalScheduleAnnouncement() {}
}
