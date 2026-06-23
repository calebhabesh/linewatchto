package com.calebhabesh.linewatch.feedback;

import org.springframework.http.HttpStatus;

public class FeedbackException extends RuntimeException {
    private final HttpStatus status;
    private final String error;

    public FeedbackException(HttpStatus status, String error, String message) {
        super(message);
        this.status = status;
        this.error = error;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getError() {
        return error;
    }
}
