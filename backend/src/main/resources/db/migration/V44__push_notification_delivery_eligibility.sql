ALTER TABLE push_saved_commute_event_observations
    ADD COLUMN delivery_allowed boolean NOT NULL DEFAULT true,
    ADD COLUMN baseline_suppressed boolean NOT NULL DEFAULT true;

ALTER TABLE push_notification_events
    ADD COLUMN delivery_allowed boolean NOT NULL DEFAULT true;
