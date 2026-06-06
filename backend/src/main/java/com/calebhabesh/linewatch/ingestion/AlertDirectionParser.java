package com.calebhabesh.linewatch.ingestion;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class AlertDirectionParser {

    public AlertDirection parse(
        String structuredDirection,
        String title,
        String headerText,
        String description
    ) {
        for (String value : new String[] { structuredDirection, title, headerText, description }) {
            AlertDirection parsed = parseField(value);
            if (parsed != AlertDirection.UNKNOWN) {
                return parsed;
            }
        }
        return AlertDirection.UNKNOWN;
    }

    private AlertDirection parseField(String value) {
        if (value == null || value.isBlank()) {
            return AlertDirection.UNKNOWN;
        }

        String text = value.toLowerCase(Locale.ROOT);
        if (text.contains("both directions")
            || text.contains("in both directions")
            || text.contains("both way")
            || text.contains("both ways")) {
            return AlertDirection.BIDIRECTIONAL;
        }

        Set<AlertDirection> matches = new LinkedHashSet<>();
        addIfPresent(matches, text, "northbound", AlertDirection.NORTHBOUND);
        addIfPresent(matches, text, "southbound", AlertDirection.SOUTHBOUND);
        addIfPresent(matches, text, "eastbound", AlertDirection.EASTBOUND);
        addIfPresent(matches, text, "westbound", AlertDirection.WESTBOUND);

        if (matches.size() > 1) {
            return AlertDirection.BIDIRECTIONAL;
        }
        return matches.isEmpty() ? AlertDirection.UNKNOWN : matches.iterator().next();
    }

    private void addIfPresent(
        Set<AlertDirection> matches,
        String text,
        String word,
        AlertDirection direction
    ) {
        if (Pattern.compile("\\b" + Pattern.quote(word) + "\\b").matcher(text).find()) {
            matches.add(direction);
        }
    }
}
