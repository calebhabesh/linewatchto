ALTER TABLE saved_commutes
    ADD COLUMN notification_outbound_day_mask integer NOT NULL DEFAULT 62,
    ADD COLUMN notification_outbound_start_minute integer DEFAULT 390,
    ADD COLUMN notification_outbound_end_minute integer DEFAULT 570,
    ADD COLUMN notification_return_day_mask integer NOT NULL DEFAULT 62,
    ADD COLUMN notification_return_start_minute integer DEFAULT 900,
    ADD COLUMN notification_return_end_minute integer DEFAULT 1140;

UPDATE saved_commutes
SET notification_outbound_day_mask = notification_day_mask,
    notification_outbound_start_minute = notification_start_minute,
    notification_outbound_end_minute = notification_end_minute,
    notification_return_day_mask = notification_day_mask,
    notification_return_start_minute = notification_start_minute,
    notification_return_end_minute = notification_end_minute;

ALTER TABLE saved_commutes
    ADD CONSTRAINT saved_commutes_notification_outbound_day_mask_check
        CHECK (notification_outbound_day_mask BETWEEN 0 AND 127),
    ADD CONSTRAINT saved_commutes_notification_return_day_mask_check
        CHECK (notification_return_day_mask BETWEEN 0 AND 127),
    ADD CONSTRAINT saved_commutes_notification_outbound_window_check
        CHECK (
            (notification_outbound_start_minute IS NULL AND notification_outbound_end_minute IS NULL)
            OR (
                notification_outbound_start_minute BETWEEN 0 AND 1439
                AND notification_outbound_end_minute BETWEEN 0 AND 1439
                AND notification_outbound_start_minute <> notification_outbound_end_minute
            )
        ),
    ADD CONSTRAINT saved_commutes_notification_return_window_check
        CHECK (
            (notification_return_start_minute IS NULL AND notification_return_end_minute IS NULL)
            OR (
                notification_return_start_minute BETWEEN 0 AND 1439
                AND notification_return_end_minute BETWEEN 0 AND 1439
                AND notification_return_start_minute <> notification_return_end_minute
            )
        );
