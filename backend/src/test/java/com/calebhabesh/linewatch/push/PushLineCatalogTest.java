package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PushLineCatalogTest {
    @Test
    void exposesSupportedRapidTransitLinesInDisplayOrder() {
        assertThat(PushLineCatalog.supportedLines())
            .extracting(PushLineCatalog.LineMetadata::id)
            .containsExactly("line-1", "line-2", "line-4", "line-5", "line-6");

        assertThat(PushLineCatalog.supportedLines())
            .extracting(PushLineCatalog.LineMetadata::identity)
            .containsExactly(
                "Line 1 Yonge-University",
                "Line 2 Bloor-Danforth",
                "Line 4 Sheppard",
                "Line 5 Eglinton",
                "Line 6 Finch West"
            );
    }

    @Test
    void usesAvailableLineNumberWithoutInventingAnUnknownLineName() {
        assertThat(PushLineCatalog.identity("line-3", "3")).isEqualTo("Line 3");
        assertThat(PushLineCatalog.identity("unknown", null)).isEqualTo("TTC");
    }
}
