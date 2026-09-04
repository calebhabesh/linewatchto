package com.calebhabesh.linewatch.regional;

import java.util.Map;

public class MetrolinxClientException extends RuntimeException {
    private final Map<String, Boolean> sourceOutcomes;

    public MetrolinxClientException(String message) {
        this(message, Map.of());
    }

    public MetrolinxClientException(String message, Map<String, Boolean> sourceOutcomes) {
        super(message);
        this.sourceOutcomes = Map.copyOf(sourceOutcomes);
    }

    public Map<String, Boolean> sourceOutcomes() {
        return sourceOutcomes;
    }

    public MetrolinxClientException withSourceOutcomes(Map<String, Boolean> outcomes) {
        return new MetrolinxClientException(getMessage(), outcomes);
    }
}
