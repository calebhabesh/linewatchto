-- Plan 17 A3: reliability keeps its polling coverage after raw ingestion runs are pruned.
-- covered is the network's merged observation windows (each successful alert poll covers
-- the 10 minutes after it completed) clipped to one Toronto calendar date, so a poll at
-- 23:55 contributes to two rows. The date is a partition key only: reads intersect by time.
-- observed_minutes is the row's covered time, rounded, for checks and summaries; summing it
-- across days can differ from the merged total by rounding, so reliability reads covered.
-- A row is final once it was rolled up 10 minutes after its date ended; earlier rows are
-- rewritten by the next roll-up and are never read in place of raw runs.
create table reliability_observation_windows (
    network_id varchar(16) not null,
    observation_date date not null,
    covered tstzmultirange not null,
    observed_minutes integer not null,
    rolled_up_at timestamptz not null,
    primary key (network_id, observation_date),
    constraint chk_reliability_observation_windows_network check (network_id in ('ttc', 'regional')),
    constraint chk_reliability_observation_windows_minutes check (observed_minutes between 0 and 1500)
);
