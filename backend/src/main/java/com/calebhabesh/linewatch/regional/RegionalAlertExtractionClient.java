package com.calebhabesh.linewatch.regional;

import java.time.Duration;
import tools.jackson.databind.JsonNode;

/** Reads one notice with a language model and returns its structured reply, unvalidated. */
interface RegionalAlertExtractionClient {
    /** Identifies the prompt and reply schema; a change re-extracts stored notices. */
    String PROMPT_VERSION = "2026-10-30.3";

    JsonNode extract(RegionalAlertExtractionInput input);

    /**
     * A failed call. {@code code} is a short, safe label for storage and logs; it never contains
     * the API key, request URI, or provider response text.
     */
    final class ExtractionException extends RuntimeException {
        private final String code;
        private final boolean retryable;
        private final Duration retryAfter;

        ExtractionException(String code, boolean retryable, Duration retryAfter) {
            super("Alert extraction failed: " + code);
            this.code = code;
            this.retryable = retryable;
            this.retryAfter = retryAfter;
        }

        String code() { return code; }
        boolean retryable() { return retryable; }
        /** The provider's requested wait, or null. */
        Duration retryAfter() { return retryAfter; }
        /** Quota or authorization failures stop the current run instead of trying the next notice. */
        boolean stopsRun() { return "rate-limited".equals(code) || "unauthorized".equals(code); }
    }
}
