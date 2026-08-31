package com.calebhabesh.linewatch.stationnotice;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcStationNoticeMonitorStore {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcStationNoticeMonitorStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<KnownStation> findKnownStations() {
        return jdbc.query(
            "select id, name from stations order by id",
            new MapSqlParameterSource(),
            (rs, rowNumber) -> new KnownStation(rs.getString("id"), rs.getString("name"))
        );
    }

    public Optional<PageObservation> findObservation(String stationId) {
        List<PageObservation> rows = jdbc.query("""
            select station_id, page_url, source_last_modified, page_content_hash,
                   notice_fingerprint, notice_text, notice_detail_url,
                   first_observed_at, last_checked_at
            from ttc_station_page_observations
            where station_id = :stationId
            """, new MapSqlParameterSource("stationId", stationId), (rs, rowNumber) -> new PageObservation(
                rs.getString("station_id"),
                rs.getString("page_url"),
                rs.getObject("source_last_modified", LocalDate.class),
                rs.getString("page_content_hash"),
                rs.getString("notice_fingerprint"),
                rs.getString("notice_text"),
                rs.getString("notice_detail_url"),
                rs.getObject("first_observed_at", OffsetDateTime.class),
                rs.getObject("last_checked_at", OffsetDateTime.class)
            ));
        return rows.stream().findFirst();
    }

    public boolean hasReviewedNoticeForSource(String stationId, String sourceUrl) {
        if (sourceUrl == null || sourceUrl.isBlank()) return false;
        Boolean exists = jdbc.queryForObject("""
            select exists (
                select 1
                from ttc_station_notices
                where station_id = :stationId
                  and active = true
                  and source_url = :sourceUrl
            )
            """, new MapSqlParameterSource()
                .addValue("stationId", stationId)
                .addValue("sourceUrl", sourceUrl), Boolean.class);
        return Boolean.TRUE.equals(exists);
    }

    public void saveObservation(PageObservation observation) {
        jdbc.update("""
            insert into ttc_station_page_observations (
                station_id, page_url, source_last_modified, page_content_hash,
                notice_fingerprint, notice_text, notice_detail_url,
                first_observed_at, last_checked_at
            ) values (
                :stationId, :pageUrl, :sourceLastModified, :pageContentHash,
                :noticeFingerprint, :noticeText, :noticeDetailUrl,
                :firstObservedAt, :lastCheckedAt
            )
            on conflict (station_id) do update set
                page_url = excluded.page_url,
                source_last_modified = excluded.source_last_modified,
                page_content_hash = excluded.page_content_hash,
                notice_fingerprint = excluded.notice_fingerprint,
                notice_text = excluded.notice_text,
                notice_detail_url = excluded.notice_detail_url,
                last_checked_at = excluded.last_checked_at
            """, new MapSqlParameterSource()
                .addValue("stationId", observation.stationId())
                .addValue("pageUrl", observation.pageUrl())
                .addValue("sourceLastModified", observation.sourceLastModified())
                .addValue("pageContentHash", observation.pageContentHash())
                .addValue("noticeFingerprint", observation.noticeFingerprint())
                .addValue("noticeText", observation.noticeText())
                .addValue("noticeDetailUrl", observation.noticeDetailUrl())
                .addValue("firstObservedAt", observation.firstObservedAt())
                .addValue("lastCheckedAt", observation.lastCheckedAt()));
    }

    public void stageCandidate(NoticeCandidate candidate) {
        jdbc.update("""
            insert into ttc_station_notice_candidates (
                candidate_key, station_id, change_type, page_url, source_last_modified,
                previous_notice_fingerprint, current_notice_fingerprint,
                current_notice_text, current_detail_url, detected_at, last_seen_at
            ) values (
                :candidateKey, :stationId, :changeType, :pageUrl, :sourceLastModified,
                :previousNoticeFingerprint, :currentNoticeFingerprint,
                :currentNoticeText, :currentDetailUrl, :detectedAt, :lastSeenAt
            )
            on conflict (candidate_key) do update set
                source_last_modified = excluded.source_last_modified,
                current_notice_text = excluded.current_notice_text,
                current_detail_url = excluded.current_detail_url,
                last_seen_at = excluded.last_seen_at
            """, new MapSqlParameterSource()
                .addValue("candidateKey", candidate.candidateKey())
                .addValue("stationId", candidate.stationId())
                .addValue("changeType", candidate.changeType())
                .addValue("pageUrl", candidate.pageUrl())
                .addValue("sourceLastModified", candidate.sourceLastModified())
                .addValue("previousNoticeFingerprint", candidate.previousNoticeFingerprint())
                .addValue("currentNoticeFingerprint", candidate.currentNoticeFingerprint())
                .addValue("currentNoticeText", candidate.currentNoticeText())
                .addValue("currentDetailUrl", candidate.currentDetailUrl())
                .addValue("detectedAt", candidate.detectedAt())
                .addValue("lastSeenAt", candidate.lastSeenAt()));
    }

    public long startRun(OffsetDateTime startedAt) {
        Long id = jdbc.queryForObject("""
            insert into ttc_station_notice_monitor_runs (status, started_at)
            values ('running', :startedAt)
            returning id
            """, new MapSqlParameterSource("startedAt", startedAt), Long.class);
        if (id == null) throw new IllegalStateException("Unable to start TTC station notice monitor run");
        return id;
    }

    public void finishRun(long id, RunCompletion completion) {
        jdbc.update("""
            update ttc_station_notice_monitor_runs set
                status = :status,
                completed_at = :completedAt,
                sitemap_pages_discovered = :sitemapPagesDiscovered,
                mapped_station_pages = :mappedStationPages,
                pages_fetched = :pagesFetched,
                pages_unchanged = :pagesUnchanged,
                notice_changes = :noticeChanges,
                candidates_staged = :candidatesStaged,
                page_failures = :pageFailures,
                error_message = :errorMessage
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", completion.status())
                .addValue("completedAt", completion.completedAt())
                .addValue("sitemapPagesDiscovered", completion.sitemapPagesDiscovered())
                .addValue("mappedStationPages", completion.mappedStationPages())
                .addValue("pagesFetched", completion.pagesFetched())
                .addValue("pagesUnchanged", completion.pagesUnchanged())
                .addValue("noticeChanges", completion.noticeChanges())
                .addValue("candidatesStaged", completion.candidatesStaged())
                .addValue("pageFailures", completion.pageFailures())
                .addValue("errorMessage", completion.errorMessage()));
    }

    public Optional<MonitorRun> findLatestRun() {
        List<MonitorRun> rows = jdbc.query("""
            select id, status, started_at, completed_at, sitemap_pages_discovered,
                   mapped_station_pages, pages_fetched, pages_unchanged,
                   notice_changes, candidates_staged, page_failures, error_message
            from ttc_station_notice_monitor_runs
            order by started_at desc
            limit 1
            """, new MapSqlParameterSource(), (rs, rowNumber) -> new MonitorRun(
                rs.getLong("id"),
                rs.getString("status"),
                rs.getObject("started_at", OffsetDateTime.class),
                rs.getObject("completed_at", OffsetDateTime.class),
                rs.getInt("sitemap_pages_discovered"),
                rs.getInt("mapped_station_pages"),
                rs.getInt("pages_fetched"),
                rs.getInt("pages_unchanged"),
                rs.getInt("notice_changes"),
                rs.getInt("candidates_staged"),
                rs.getInt("page_failures"),
                rs.getString("error_message")
            ));
        return rows.stream().findFirst();
    }

    public int countPendingCandidates() {
        Integer count = jdbc.queryForObject(
            "select count(*) from ttc_station_notice_candidates where review_status = 'pending'",
            new MapSqlParameterSource(),
            Integer.class
        );
        return count == null ? 0 : count;
    }

    public record KnownStation(String id, String name) {}

    public record PageObservation(
        String stationId,
        String pageUrl,
        LocalDate sourceLastModified,
        String pageContentHash,
        String noticeFingerprint,
        String noticeText,
        String noticeDetailUrl,
        OffsetDateTime firstObservedAt,
        OffsetDateTime lastCheckedAt
    ) {}

    public record NoticeCandidate(
        String candidateKey,
        String stationId,
        String changeType,
        String pageUrl,
        LocalDate sourceLastModified,
        String previousNoticeFingerprint,
        String currentNoticeFingerprint,
        String currentNoticeText,
        String currentDetailUrl,
        OffsetDateTime detectedAt,
        OffsetDateTime lastSeenAt
    ) {}

    public record RunCompletion(
        String status,
        OffsetDateTime completedAt,
        int sitemapPagesDiscovered,
        int mappedStationPages,
        int pagesFetched,
        int pagesUnchanged,
        int noticeChanges,
        int candidatesStaged,
        int pageFailures,
        String errorMessage
    ) {}

    public record MonitorRun(
        long id,
        String status,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        int sitemapPagesDiscovered,
        int mappedStationPages,
        int pagesFetched,
        int pagesUnchanged,
        int noticeChanges,
        int candidatesStaged,
        int pageFailures,
        String errorMessage
    ) {}
}
