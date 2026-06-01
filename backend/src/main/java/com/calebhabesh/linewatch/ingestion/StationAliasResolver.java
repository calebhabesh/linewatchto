package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.station.StationRepository;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class StationAliasResolver {
    private static final Map<String, String> ALIASES = Map.ofEntries(
        Map.entry("eglinton west", "cedarvale"),
        Map.entry("dundas", "tmu"),
        Map.entry("vaughan", "vaughan-metropolitan-centre"),
        Map.entry("vaughan metropolitan centre", "vaughan-metropolitan-centre"),
        Map.entry("o connor", "o_connor"),
        Map.entry("greenwood", "greenwoood"),
        Map.entry("queens park", "queens-park"),
        Map.entry("queen s park", "queens-park"),
        Map.entry("aga khan park and museum", "aga-khan-park-and-museum")
    );

    private final StationRepository stationRepository;

    public StationAliasResolver(StationRepository stationRepository) {
        this.stationRepository = stationRepository;
    }

    public Optional<String> resolve(String stationName) {
        if (stationName == null || stationName.isBlank()) {
            return Optional.empty();
        }

        String normalized = normalize(stationName);
        if (normalized.isBlank()) {
            return Optional.empty();
        }

        String stationId = ALIASES.getOrDefault(normalized, normalized.replace(' ', '-'));
        return stationRepository.existsById(stationId)
            ? Optional.of(stationId)
            : Optional.empty();
    }

    private String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replace("&", " and ")
            .replaceAll("[^a-z0-9]+", " ")
            .trim()
            .replaceAll("\\s+", " ");
    }
}
