package com.calebhabesh.linewatch.performance;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Component;

@Component
public class TtcPerformanceParser {
    private static final String TITLE = "On-time performance and elevator/escalator status";
    private static final Pattern METRIC_PATTERN = Pattern.compile("(?i)\\b(Line\\s+[124]|Bus|Streetcar|Wheel-Trans|Elevators|Escalators)\\b\\s*:?\\s*(\\d{1,3})\\s*%");

    public TtcPerformanceResponses.SnapshotResponse parse(String html, String sourceUrl, OffsetDateTime fetchedAt) {
        Document document = Jsoup.parse(html == null ? "" : html);
        Element section = findPerformanceSection(document);
        String updatedLabel = updatedLabel(section);

        List<TtcPerformanceResponses.MetricResponse> metrics = new ArrayList<>();
        Elements cards = section.select(".otp-card");
        if (!cards.isEmpty()) {
            for (Element card : cards) {
                Element nameEl = card.selectFirst(".otp-service-name");
                Element pctEl = card.selectFirst(".otp-percentage");
                if (nameEl != null && pctEl != null) {
                    String rawLabel = nameEl.text().trim();
                    String pctText = pctEl.text().replaceAll("[^0-9]", "");
                    if (!pctText.isEmpty()) {
                        int percentage = Integer.parseInt(pctText);
                        String label = canonicalLabel(rawLabel);
                        String id = idFor(label);
                        metrics.add(new TtcPerformanceResponses.MetricResponse(
                            id,
                            label,
                            categoryFor(id),
                            percentage,
                            targetFor(id),
                            percentage + "%",
                            null
                        ));
                    }
                }
            }
        } else {
            String text = section.text().replace('\u00a0', ' ').replaceAll("\\s+", " ").trim();
            metrics = parseMetricsFromText(text);
        }

        if (metrics.isEmpty()) {
            throw new TtcPerformanceParseException("TTC performance block did not contain percentage metrics");
        }
        return new TtcPerformanceResponses.SnapshotResponse(
            "available",
            "TTC.ca",
            sourceUrl,
            TITLE,
            updatedLabel,
            fetchedAt,
            false,
            "Official TTC performance metrics loaded from TTC.ca.",
            metrics
        );
    }

    private Element findPerformanceSection(Document document) {
        Element heading = document.select("h1, h2, h3, h4, h5, h6, .otp-title").stream()
            .filter(element -> normalize(element.text()).contains(normalize(TITLE)))
            .findFirst()
            .orElseThrow(() -> new TtcPerformanceParseException("TTC performance heading was not found"));
        Element section = heading.closest("section, .otp-dashboard-wrapper, .otp-dashboard-container");
        if (section != null) {
            return section;
        }
        Element parent = heading.parent();
        if (parent == null) {
            throw new TtcPerformanceParseException("TTC performance section was not found");
        }
        return parent;
    }

    private String updatedLabel(Element section) {
        return section.getAllElements().stream()
            .map(Element::ownText)
            .filter(text -> text.toLowerCase(Locale.ROOT).contains("last updated"))
            .findFirst()
            .map(text -> {
                Matcher matcher = Pattern.compile("(?i)last\\s+updated\\s*:?\\s*(.+)").matcher(text.replace('\u00a0', ' ').replaceAll("\\s+", " ").trim());
                if (matcher.find()) {
                    return matcher.group(1).trim();
                }
                return "Not provided";
            })
            .orElse("Not provided");
    }

    private List<TtcPerformanceResponses.MetricResponse> parseMetricsFromText(String text) {
        Map<String, TtcPerformanceResponses.MetricResponse> byId = new LinkedHashMap<>();
        Matcher matcher = METRIC_PATTERN.matcher(text);
        while (matcher.find()) {
            String label = canonicalLabel(matcher.group(1));
            int percentage = Integer.parseInt(matcher.group(2));
            if (percentage < 0 || percentage > 100) {
                continue;
            }
            String id = idFor(label);
            byId.putIfAbsent(id, new TtcPerformanceResponses.MetricResponse(
                id,
                label,
                categoryFor(id),
                percentage,
                targetFor(id),
                percentage + "%",
                null
            ));
        }
        return List.copyOf(new ArrayList<>(byId.values()));
    }

    private String canonicalLabel(String raw) {
        String normalized = raw.trim().replaceAll("\\s+", " ");
        if (normalized.equalsIgnoreCase("yonge-university line") || normalized.equalsIgnoreCase("yonge-university")) {
            return "Line 1";
        }
        if (normalized.equalsIgnoreCase("bloor-danforth line") || normalized.equalsIgnoreCase("bloor-danforth")) {
            return "Line 2";
        }
        if (normalized.equalsIgnoreCase("sheppard line") || normalized.equalsIgnoreCase("sheppard")) {
            return "Line 4";
        }
        if (normalized.equalsIgnoreCase("elevator")) {
            return "Elevators";
        }
        if (normalized.equalsIgnoreCase("escalator")) {
            return "Escalators";
        }
        if (normalized.matches("(?i)line\\s+[124]")) {
            return "Line " + normalized.replaceAll("(?i)line\\s+", "");
        }
        if (normalized.equalsIgnoreCase("bus")) return "Bus";
        if (normalized.equalsIgnoreCase("streetcar")) return "Streetcar";
        if (normalized.equalsIgnoreCase("wheel-trans")) return "Wheel-Trans";
        if (normalized.equalsIgnoreCase("elevators")) return "Elevators";
        if (normalized.equalsIgnoreCase("escalators")) return "Escalators";
        return normalized;
    }

    private String idFor(String label) {
        return switch (label.toLowerCase(Locale.ROOT)) {
            case "line 1" -> "line-1";
            case "line 2" -> "line-2";
            case "line 4" -> "line-4";
            case "bus" -> "bus";
            case "streetcar" -> "streetcar";
            case "wheel-trans" -> "wheel-trans";
            case "elevators" -> "elevators";
            case "escalators" -> "escalators";
            default -> label.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        };
    }

    private String categoryFor(String id) {
        if (id.startsWith("line-")) return "subway";
        if (id.equals("bus") || id.equals("streetcar") || id.equals("wheel-trans")) return "surface";
        if (id.equals("elevators") || id.equals("escalators")) return "accessibility";
        return "other";
    }

    private Integer targetFor(String id) {
        return switch (id) {
            case "line-1", "line-2", "line-4" -> 96;
            case "bus", "streetcar", "wheel-trans" -> 90;
            case "elevators" -> 98;
            case "escalators" -> 97;
            default -> null;
        };
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    public static class TtcPerformanceParseException extends RuntimeException {
        public TtcPerformanceParseException(String message) {
            super(message);
        }
    }
}
