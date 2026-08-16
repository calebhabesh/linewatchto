alter table alert_active_periods
    add column source_current_continuous boolean not null default false;

comment on column alert_active_periods.source_current_continuous is
    'True only when TTC explicitly identifies a parent period as a current continuous closure; permits long active windows without trusting generic publication envelopes.';
