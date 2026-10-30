package com.calebhabesh.linewatch.regional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class RegionalAlertExtractionStore {
    private final NamedParameterJdbcTemplate jdbc;

    RegionalAlertExtractionStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    record Observed(long id, String status, String resultJson, String differencesJson) {}

    record Due(long id, String inputJson, String deterministicJson, int attempts) {}

    /** Records that the notice text is in the feed, creating a pending extraction for new text. */
    Observed observe(
        String inputHash, String model, String promptVersion, String canonicalEventId,
        String inputJson, String deterministicJson, OffsetDateTime appliesUntil, OffsetDateTime now
    ) {
        return jdbc.queryForObject("""
            insert into regional_alert_extractions (
                input_hash, model, prompt_version, canonical_event_id, input, status, next_attempt_at,
                deterministic, applies_until, first_seen_at, last_seen_at
            ) values (
                :hash, :model, :promptVersion, :eventId, cast(:input as jsonb), 'pending', :now,
                cast(:deterministic as jsonb), :appliesUntil, :now, :now
            )
            on conflict (input_hash, model, prompt_version) do update set
                canonical_event_id = excluded.canonical_event_id,
                deterministic = excluded.deterministic,
                applies_until = excluded.applies_until,
                last_seen_at = excluded.last_seen_at
            returning id, status, result::text as result, differences::text as differences
            """,
            new MapSqlParameterSource()
                .addValue("hash", inputHash)
                .addValue("model", model)
                .addValue("promptVersion", promptVersion)
                .addValue("eventId", canonicalEventId)
                .addValue("input", inputJson)
                .addValue("deterministic", deterministicJson)
                .addValue("appliesUntil", appliesUntil)
                .addValue("now", now),
            (rs, row) -> new Observed(rs.getLong("id"), rs.getString("status"), rs.getString("result"),
                rs.getString("differences")));
    }

    List<Due> findDue(String model, String promptVersion, OffsetDateTime now, OffsetDateTime seenSince, int limit) {
        return jdbc.query("""
            select id, input::text as input, deterministic::text as deterministic, attempts
            from regional_alert_extractions
            where status = 'pending'
              and model = :model
              and prompt_version = :promptVersion
              and next_attempt_at <= :now
              and last_seen_at >= :seenSince
              and (applies_until is null or applies_until > :now)
            order by first_seen_at, id
            limit :limit
            """,
            new MapSqlParameterSource()
                .addValue("model", model)
                .addValue("promptVersion", promptVersion)
                .addValue("now", now)
                .addValue("seenSince", seenSince)
                .addValue("limit", limit),
            (rs, row) -> new Due(rs.getLong("id"), rs.getString("input"), rs.getString("deterministic"),
                rs.getInt("attempts")));
    }

    /** Due pending readings for the given notice texts, oldest first. */
    List<Due> findDueByHashes(
        Collection<String> inputHashes, String model, String promptVersion, OffsetDateTime now, int limit
    ) {
        if (inputHashes.isEmpty() || limit <= 0) return List.of();
        return jdbc.query("""
            select id, input::text as input, deterministic::text as deterministic, attempts
            from regional_alert_extractions
            where status = 'pending'
              and model = :model
              and prompt_version = :promptVersion
              and next_attempt_at <= :now
              and input_hash in (:hashes)
            order by first_seen_at, id
            limit :limit
            """,
            new MapSqlParameterSource()
                .addValue("model", model)
                .addValue("promptVersion", promptVersion)
                .addValue("now", now)
                .addValue("hashes", List.copyOf(inputHashes))
                .addValue("limit", limit),
            (rs, row) -> new Due(rs.getLong("id"), rs.getString("input"), rs.getString("deterministic"),
                rs.getInt("attempts")));
    }

    /**
     * Claims a due pending reading until {@code leaseUntil}, so the ingestion poll and the
     * background job never send the same notice twice. Returns false when another caller has it.
     */
    boolean claim(long id, OffsetDateTime now, OffsetDateTime leaseUntil) {
        return jdbc.update("""
            update regional_alert_extractions
            set next_attempt_at = :leaseUntil
            where id = :id and status = 'pending' and next_attempt_at <= :now
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("now", now)
                .addValue("leaseUntil", leaseUntil)) == 1;
    }

    /** Succeeded readings keyed by input hash. */
    Map<String, String> findSucceeded(Collection<String> inputHashes, String model, String promptVersion) {
        if (inputHashes.isEmpty()) return Map.of();
        Map<String, String> results = new HashMap<>();
        jdbc.query("""
            select input_hash, result::text as result
            from regional_alert_extractions
            where status = 'succeeded'
              and model = :model
              and prompt_version = :promptVersion
              and input_hash in (:hashes)
            """,
            new MapSqlParameterSource()
                .addValue("model", model)
                .addValue("promptVersion", promptVersion)
                .addValue("hashes", List.copyOf(inputHashes)),
            rs -> { results.put(rs.getString("input_hash"), rs.getString("result")); });
        return Map.copyOf(results);
    }

    void succeed(long id, String resultJson, String differencesJson, OffsetDateTime now) {
        jdbc.update("""
            update regional_alert_extractions
            set status = 'succeeded', attempts = attempts + 1, result = cast(:result as jsonb),
                differences = cast(:differences as jsonb), last_error = null, completed_at = :now
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("result", resultJson)
                .addValue("differences", differencesJson)
                .addValue("now", now));
    }

    void updateDifferences(long id, String differencesJson) {
        jdbc.update("""
            update regional_alert_extractions set differences = cast(:differences as jsonb) where id = :id
            """, new MapSqlParameterSource().addValue("id", id).addValue("differences", differencesJson));
    }

    /** A final outcome without a usable reading: 'rejected' (invalid reply) or 'failed' (gave up). */
    void finish(long id, String status, String error, OffsetDateTime now) {
        jdbc.update("""
            update regional_alert_extractions
            set status = :status, attempts = attempts + 1, last_error = :error, completed_at = :now
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", status)
                .addValue("error", error)
                .addValue("now", now));
    }

    /** Leaves the extraction pending until {@code nextAttemptAt}; {@code countAttempt} is false for quota waits. */
    void retryLater(long id, String error, OffsetDateTime nextAttemptAt, boolean countAttempt) {
        jdbc.update("""
            update regional_alert_extractions
            set attempts = attempts + :increment, last_error = :error, next_attempt_at = :next
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("increment", countAttempt ? 1 : 0)
                .addValue("error", error)
                .addValue("next", nextAttemptAt));
    }

    int requestsOn(LocalDate serviceDate, String model) {
        List<Integer> counts = jdbc.queryForList("""
            select requests from regional_alert_extraction_usage where usage_date = :date and model = :model
            """, new MapSqlParameterSource().addValue("date", serviceDate).addValue("model", model), Integer.class);
        return counts.isEmpty() ? 0 : counts.getFirst();
    }

    void recordRequest(LocalDate serviceDate, String model) {
        jdbc.update("""
            insert into regional_alert_extraction_usage (usage_date, model, requests)
            values (:date, :model, 1)
            on conflict (usage_date, model) do update
            set requests = regional_alert_extraction_usage.requests + 1
            """, new MapSqlParameterSource().addValue("date", serviceDate).addValue("model", model));
    }
}
