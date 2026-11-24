package com.calebhabesh.linewatch.reliability;

import org.springframework.http.HttpStatus;

/** A range API request the server refuses, reported as {@code {error, message}}. */
public class ReliabilityRangeException extends RuntimeException {
    private final HttpStatus status;
    private final String error;

    public ReliabilityRangeException(HttpStatus status, String error, String message) {
        super(message);
        this.status = status;
        this.error = error;
    }

    static ReliabilityRangeException badRequest(String error, String message) {
        return new ReliabilityRangeException(HttpStatus.BAD_REQUEST, error, message);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getError() {
        return error;
    }
}
