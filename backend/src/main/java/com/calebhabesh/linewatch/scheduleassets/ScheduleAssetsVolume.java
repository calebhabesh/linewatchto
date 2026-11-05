package com.calebhabesh.linewatch.scheduleassets;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The schedule-assets service's volume, mounted read-only (plan 16): its
 * {@code manifest.json} names the published schedule-derived files per network,
 * and {@code status.json} is the service's health. Disabled when
 * {@code linewatch.schedule-assets.dir} is empty (local development, tests).
 */
@Component
public class ScheduleAssetsVolume {
    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final long MAX_JSON_BYTES = 1024 * 1024;

    private final Path root;

    public ScheduleAssetsVolume(@Value("${linewatch.schedule-assets.dir:}") String dir) {
        this.root = dir == null || dir.isBlank() ? null : Path.of(dir).toAbsolutePath().normalize();
    }

    public boolean enabled() {
        return root != null;
    }

    public Optional<JsonNode> manifest() {
        return readJson("manifest.json");
    }

    public Optional<JsonNode> status() {
        return readJson("status.json");
    }

    /** The published path of a network's file ({@code files/go-bus-stops.<hash>.csv}), if the manifest names one. */
    public Optional<String> publishedPath(JsonNode manifest, String network, String name) {
        JsonNode path = manifest.path("networks").path(network).path("files").path(name);
        return path.isString() ? Optional.of(path.asString()) : Optional.empty();
    }

    /** A published file inside {@code files/}; anything that would leave it is refused. */
    public Optional<Path> resolve(String publishedPath) {
        if (root == null || publishedPath == null || !publishedPath.matches("files/[A-Za-z0-9._-]+")) return Optional.empty();
        Path file = root.resolve(publishedPath).normalize();
        return file.startsWith(root.resolve("files")) && Files.isRegularFile(file) ? Optional.of(file) : Optional.empty();
    }

    private Optional<JsonNode> readJson(String name) {
        if (root == null) return Optional.empty();
        Path file = root.resolve(name);
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > MAX_JSON_BYTES) return Optional.empty();
            return Optional.of(JSON.readTree(Files.readString(file)));
        } catch (IOException | RuntimeException exception) {
            return Optional.empty();
        }
    }
}
