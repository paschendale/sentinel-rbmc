-- One-time, before the first start of the fork image on the RBMC database that ran the old
-- `rbmc` branch (applied 2026-11). It renames that branch's migration records to the names they
-- have now, so no migration runs twice:
--
--   017_rbmc_stations                      -> 900_rbmc_stations (fork migrations are 900-999)
--   019_assertion_results_started_at_idx   -> 017_... (upstream's number for the same SQL)
--   020_notification_events_created_at_idx -> 018_... (upstream's number for the same SQL)
--   018_public_status_window               -> dropped: upstream's 023_test_state_streaks adds the
--                                             same two columns with IF NOT EXISTS
BEGIN;
UPDATE schema_migrations SET filename = '900_rbmc_stations.sql' WHERE filename = '017_rbmc_stations.sql';
UPDATE schema_migrations SET filename = '017_assertion_results_started_at_idx.sql' WHERE filename = '019_assertion_results_started_at_idx.sql';
UPDATE schema_migrations SET filename = '018_notification_events_created_at_idx.sql' WHERE filename = '020_notification_events_created_at_idx.sql';
DELETE FROM schema_migrations WHERE filename = '018_public_status_window.sql';
COMMIT;
