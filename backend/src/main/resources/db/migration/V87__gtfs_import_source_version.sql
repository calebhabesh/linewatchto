-- Identifies the published CKAN file an import came from, so the refresh job can poll
-- for a new release often without re-importing an unchanged package.
alter table gtfs_schedule_imports add column source_version text;
