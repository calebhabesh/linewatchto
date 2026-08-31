package com.calebhabesh.linewatch.stationnotice;

import java.net.URI;
import java.util.Optional;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

@Component
public class TtcStationPageNoticeParser {
    private static final int MAX_NOTICE_CHARACTERS = 8_000;

    public Optional<DetectedNotice> parse(String html, URI stationPageUri) {
        Document document = Jsoup.parse(html == null ? "" : html, stationPageUri.toString());
        Element content = document.selectFirst(
            ".component.rich-text.u-bt--red .component-content,"
                + " .component.rich-text[class*=u-bt--red] .component-content"
        );
        if (content == null) return Optional.empty();

        String text = clean(content.text());
        if (text.isBlank()) return Optional.empty();
        if (text.length() > MAX_NOTICE_CHARACTERS) {
            text = text.substring(0, MAX_NOTICE_CHARACTERS).trim();
        }
        String normalizedText = text;

        String title = content.select("strong").stream()
            .map(Element::text)
            .map(this::clean)
            .filter(value -> !value.isBlank())
            .findFirst()
            .orElseGet(() -> firstSentence(normalizedText));
        String detailUrl = content.select("a[href]").stream()
            .map(link -> link.absUrl("href"))
            .filter(value -> value.startsWith("https://www.ttc.ca/"))
            .findFirst()
            .orElse(stationPageUri.toString());

        return Optional.of(new DetectedNotice(title, normalizedText, detailUrl));
    }

    private String firstSentence(String value) {
        int boundary = value.indexOf('.');
        return boundary > 0 ? value.substring(0, boundary + 1) : value;
    }

    private String clean(String value) {
        return value == null ? "" : value.replace('\u00a0', ' ').replaceAll("\\s+", " ").trim();
    }

    public record DetectedNotice(String title, String text, String detailUrl) {}
}
