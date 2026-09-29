package com.calebhabesh.linewatch.ingestion;

import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Pattern;

/** Explicit rider wording; a provider cause is deliberately not effect evidence. */
public final class TtcLimitedService {
    private static final Pattern LIMITED = Pattern.compile("\\blimited (?:nightly )?(?:(?:subway|lrt|train|rail) )?service\\b");
    private static final Pattern UNSUPPORTED = Pattern.compile(
        "\\b(?:no(?: longer)?|not|without) limited\\b|\\blimited[^.!]*\\b(?:ended|restored|resumed|over|lifted)\\b"
            + "|\\b(?:no (?:subway |lrt |train )?service|service (?:is |will be )?(?:suspended|closed))\\b"
            + "|\\blimited[^.!]*\\bno longer\\b"
            + "|\\b(?:will not|won't|not be)\\b[^.!]*\\blimited\\b"
            + "|\\b(?:may|might|could)\\b");
    private static final Pattern CURRENT = Pattern.compile("\\bthere (?:is|are) limited (?:nightly )?(?:(?:subway|lrt|train|rail) )?service\\b");
    private static final Pattern FUTURE = Pattern.compile("\\b(?:will|starting|starts|scheduled|tomorrow)\\b");

    private TtcLimitedService() {}

    private static String text(String... values) {
        return String.join(" ", Arrays.stream(values).map(value -> value == null ? "" : value).toList())
            .toLowerCase(Locale.ROOT);
    }

    public static boolean hasWording(String... values) {
        return LIMITED.matcher(text(values)).find();
    }

    public static boolean isAffirmative(String... values) {
        String text = text(values);
        return LIMITED.matcher(text).find() && !UNSUPPORTED.matcher(text).find();
    }

    public static boolean isFuture(String... values) {
        String text = text(values);
        return FUTURE.matcher(text).find() && !CURRENT.matcher(text).find();
    }
}
