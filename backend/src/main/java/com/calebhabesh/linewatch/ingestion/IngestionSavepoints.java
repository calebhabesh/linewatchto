package com.calebhabesh.linewatch.ingestion;

/**
 * Runs one unit of ingestion work (one provider record's normalization or write) so that its
 * failure can be contained: the unit's database changes are undone and the exception rethrown,
 * leaving the surrounding run's transaction usable for every other record.
 */
@FunctionalInterface
public interface IngestionSavepoints {
    void run(Runnable work);

    /** No isolation: for unit tests whose stores are mocks. */
    IngestionSavepoints NONE = Runnable::run;
}
