alter table saved_commutes
    add column notification_trip_cancellation_enabled boolean not null default true;

alter table push_notification_preferences
    add column saved_commute_trip_cancellation_enabled boolean not null default true,
    add column line_trip_cancellation_enabled boolean not null default true;
