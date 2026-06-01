package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationRepository;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StationAliasResolverTest {
    private final StationRepository stationRepository = mock(StationRepository.class);
    private StationAliasResolver resolver;

    @BeforeEach
    void setUp() {
        Set<String> seededIds = Set.of(
            "st-george",
            "st-clair",
            "cedarvale",
            "tmu",
            "vaughan-metropolitan-centre",
            "o_connor",
            "greenwoood",
            "queens-park",
            "aga-khan-park-and-museum"
        );
        when(stationRepository.existsById(anyString()))
            .thenAnswer(invocation -> seededIds.contains(invocation.getArgument(0)));
        resolver = new StationAliasResolver(stationRepository);
    }

    @Test
    void resolvesCanonicalNamesAndExplicitTtcAliases() {
        assertThat(resolver.resolve("St George")).contains("st-george");
        assertThat(resolver.resolve("St. Clair")).contains("st-clair");
        assertThat(resolver.resolve("Eglinton West")).contains("cedarvale");
        assertThat(resolver.resolve("Dundas")).contains("tmu");
        assertThat(resolver.resolve("Vaughan")).contains("vaughan-metropolitan-centre");
        assertThat(resolver.resolve("Vaughan Metropolitan Centre"))
            .contains("vaughan-metropolitan-centre");
        assertThat(resolver.resolve("O'Connor")).contains("o_connor");
        assertThat(resolver.resolve("Greenwood")).contains("greenwoood");
        assertThat(resolver.resolve("Queens Park")).contains("queens-park");
        assertThat(resolver.resolve("Queen's Park")).contains("queens-park");
        assertThat(resolver.resolve("Aga Khan Park & Museum"))
            .contains("aga-khan-park-and-museum");
    }

    @Test
    void normalizesDiacriticsAndPunctuationBeforeGeneratingSlug() {
        assertThat(resolver.resolve("  St. Cláir  ")).contains("st-clair");
    }

    @Test
    void blankAndUnknownStationNamesRemainUnresolved() {
        assertThat(resolver.resolve(null)).isEmpty();
        assertThat(resolver.resolve("   ")).isEmpty();
        assertThat(resolver.resolve("Imaginary Station")).isEmpty();
    }
}
