package com.calebhabesh.linewatch.ingestion;

public enum TtcSourceFetchStatus {
    SUCCESS("success"),
    TIMEOUT("timeout"),
    HTTP_ERROR("http-error"),
    INVALID_RESPONSE("invalid-response"),
    REQUEST_ERROR("request-error");

    private final String persistedValue;

    TtcSourceFetchStatus(String persistedValue) {
        this.persistedValue = persistedValue;
    }

    public String persistedValue() {
        return persistedValue;
    }
}
