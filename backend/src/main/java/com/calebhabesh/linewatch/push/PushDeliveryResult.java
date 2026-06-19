package com.calebhabesh.linewatch.push;

public record PushDeliveryResult(String status, Integer httpStatus, String message) {
    public static PushDeliveryResult accepted(int httpStatus) {
        return new PushDeliveryResult("accepted", httpStatus, null);
    }

    public static PushDeliveryResult gone(int httpStatus) {
        return new PushDeliveryResult("gone", httpStatus, "Subscription is no longer valid.");
    }

    public static PushDeliveryResult skipped(String message) {
        return new PushDeliveryResult("skipped", null, message);
    }

    public static PushDeliveryResult failed(Integer httpStatus, String message) {
        return new PushDeliveryResult("failed", httpStatus, message);
    }

    public boolean accepted() {
        return "accepted".equals(status);
    }

    public boolean invalidSubscription() {
        return "gone".equals(status);
    }
}
