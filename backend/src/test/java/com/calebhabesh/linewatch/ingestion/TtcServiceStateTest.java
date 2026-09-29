package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TtcServiceStateTest {
    @ParameterizedTest
    @ValueSource(strings = {
        "Regular service will resume every morning at 6 a.m.",
        "Regular service resumes each morning at 6 a.m.",
        "Regular service will be restored after the nightly window."
    })
    void futureRegularServiceWordingDoesNotCompleteTheAdvisory(String description) {
        assertThat(TtcServiceState.isRestoration("LIMITED_SERVICE", "planned", "Limited nightly service", description, "Limited service")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "Regular service has resumed.",
        "Regular service is restored.",
        "Regular service is operating normally."
    })
    void explicitRegularServiceConfirmationStillCompletesTheAdvisory(String description) {
        assertThat(TtcServiceState.isRestoration("LIMITED_SERVICE", "planned", "Limited service", description, "Limited service")).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "ENDED EARLY - Finch to Sheppard-Yonge stations – Full weekend closure",
        "Line 1 (Yonge-University) – ENDED EARLY - Finch to Sheppard-Yonge stations",
        "Line 1: Ended early: Weekend closure",
        "Weekend closure — ENDED EARLY",
        "ENDED EARLY"
    })
    void explicitCompletionOverridesOriginalClosureCopy(String title) {
        assertThat(TtcServiceState.isRestoration(
            "NO_SERVICE", "planned", title,
            "Subway service will be replaced by shuttle buses until Sunday.", "Subway closure"
        )).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "Line 1 – ENDING EARLY - Weekend closure",
        "Subway service will end early at 11:59 p.m.",
        "Line 1 – Early closure for planned track work",
        "Subway service ended early for planned track work",
        "Weekend closure has not ended early"
    })
    void doesNotConfuseEarlyServiceShutdownOrFutureEndingWithClosureCompletion(String title) {
        assertThat(TtcServiceState.isRestoration(
            "NO_SERVICE", "planned", title, "Shuttle buses replace subway service.", "Subway closure"
        )).isFalse();
    }
}
