package com.calebhabesh.linewatch.ingestion;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Savepoint;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * JDBC savepoints on the run transaction's own connection. Spring's JpaTransactionManager does not
 * allow nested transactions by default, but it binds its JDBC connection for the DataSource, which
 * is the connection the ingestion stores' JdbcTemplates use, so a savepoint here covers their writes.
 * PostgreSQL aborts the whole transaction on any statement error unless it is rolled back to a
 * savepoint, so catching the exception alone is not enough.
 */
@Component
public class JdbcIngestionSavepoints implements IngestionSavepoints {
    private final DataSource dataSource;

    public JdbcIngestionSavepoints(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(Runnable work) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            work.run();
            return;
        }
        Connection connection = DataSourceUtils.getConnection(dataSource);
        try {
            Savepoint savepoint = connection.setSavepoint();
            try {
                work.run();
            } catch (RuntimeException failure) {
                connection.rollback(savepoint);
                throw failure;
            }
            connection.releaseSavepoint(savepoint);
        } catch (SQLException exception) {
            throw new TransactionSystemException("Ingestion savepoint failed", exception);
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }
    }
}
