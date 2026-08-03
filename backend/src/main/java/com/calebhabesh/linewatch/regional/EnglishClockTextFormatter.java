package com.calebhabesh.linewatch.regional;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Converts unambiguous 24-hour clock tokens in English rider-facing prose. */
public final class EnglishClockTextFormatter {
    private static final Pattern CLOCK_TOKEN = Pattern.compile(
        "(?<![\\p{L}\\d])(?<hour>[012]\\d):(?<minute>[0-5]\\d)(?![\\p{L}\\d:]|\\s*(?i:a\\.?m\\.?|p\\.?m\\.?))"
    );

    private EnglishClockTextFormatter() {}

    public static String toTwelveHourClock(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }

        Matcher matcher = CLOCK_TOKEN.matcher(value);
        StringBuilder formatted = new StringBuilder(value.length());
        while (matcher.find()) {
            int hour = Integer.parseInt(matcher.group("hour"));
            if (hour > 24 || hour == 24 && !"00".equals(matcher.group("minute"))) {
                matcher.appendReplacement(formatted, Matcher.quoteReplacement(matcher.group()));
                continue;
            }
            String period = hour < 12 || hour == 24 ? "AM" : "PM";
            int twelveHour = hour % 12;
            if (twelveHour == 0) {
                twelveHour = 12;
            }
            String replacement = String.format(
                Locale.CANADA,
                "%d:%s %s",
                twelveHour,
                matcher.group("minute"),
                period
            );
            matcher.appendReplacement(formatted, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(formatted);
        return formatted.toString();
    }
}
