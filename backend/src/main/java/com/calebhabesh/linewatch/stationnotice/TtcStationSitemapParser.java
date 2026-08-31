package com.calebhabesh.linewatch.stationnotice;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Component;

@Component
public class TtcStationSitemapParser {
    public SitemapDocument parse(String xml, URI sourceUri) {
        Document document = Jsoup.parse(xml == null ? "" : xml, sourceUri.toString(), Parser.xmlParser());
        List<URI> childSitemaps = new ArrayList<>();
        List<StationPage> stationPages = new ArrayList<>();

        for (Element sitemap : document.select("sitemap")) {
            parseUri(sitemap.selectFirst("loc")).ifPresent(childSitemaps::add);
        }
        for (Element url : document.select("url")) {
            parseUri(url.selectFirst("loc"))
                .filter(this::isStationPage)
                .ifPresent(uri -> stationPages.add(new StationPage(uri, parseDate(url.selectFirst("lastmod")))));
        }
        return new SitemapDocument(List.copyOf(childSitemaps), List.copyOf(stationPages));
    }

    private java.util.Optional<URI> parseUri(Element element) {
        if (element == null || element.text().isBlank()) return java.util.Optional.empty();
        try {
            return java.util.Optional.of(URI.create(element.text().trim()));
        } catch (IllegalArgumentException exception) {
            return java.util.Optional.empty();
        }
    }

    private LocalDate parseDate(Element element) {
        if (element == null || element.text().isBlank()) return null;
        String value = element.text().trim();
        try {
            return LocalDate.parse(value.length() >= 10 ? value.substring(0, 10) : value);
        } catch (DateTimeParseException exception) {
            return null;
        }
    }

    private boolean isStationPage(URI uri) {
        return uri.getPath() != null && uri.getPath().toLowerCase().startsWith("/subway-stations/");
    }

    public record SitemapDocument(List<URI> childSitemaps, List<StationPage> stationPages) {}
    public record StationPage(URI uri, LocalDate lastModified) {}
}
