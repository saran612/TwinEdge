#!/usr/bin/env bash
set -euo pipefail

# Initialize Postgres roles and database with SCRAM-SHA-256
POSTGRES_DB="${POSTGRES_DB:-twinedge}"
APP_USER="${POSTGRES_APP_USER:-twinedge_app}"
APP_PASSWORD="${POSTGRES_APP_PASSWORD:-twinedge_app_secret}"
MIGRATOR_USER="${POSTGRES_MIGRATOR_USER:-twinedge_migrator}"
MIGRATOR_PASSWORD="${POSTGRES_MIGRATOR_PASSWORD:-twinedge_migrator_secret}"
RO_USER="${POSTGRES_RO_USER:-twinedge_ro}"
RO_PASSWORD="${POSTGRES_RO_PASSWORD:-twinedge_ro_secret}"

echo "Configuring PostgreSQL roles with SCRAM-SHA-256..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Ensure password encryption is scram-sha-256
    SET password_encryption = 'scram-sha-256';

    -- 1. twinedge_migrator (DDL role, owns the schema)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${MIGRATOR_USER}') THEN
            CREATE ROLE ${MIGRATOR_USER} WITH LOGIN PASSWORD '${MIGRATOR_PASSWORD}';
        END IF;
    END
    \$\$;

    -- 2. twinedge_app (DML role: INSERT and SELECT on log tables, DELETE only for retention janitor, NO DDL)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_USER}') THEN
            CREATE ROLE ${APP_USER} WITH LOGIN PASSWORD '${APP_PASSWORD}';
        END IF;
    END
    \$\$;

    -- 3. twinedge_ro (Read-only role: SELECT only)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${RO_USER}') THEN
            CREATE ROLE ${RO_USER} WITH LOGIN PASSWORD '${RO_PASSWORD}';
        END IF;
    END
    \$\$;

    -- Grant base connection privileges
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${MIGRATOR_USER}, ${APP_USER}, ${RO_USER};
    GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATOR_USER};
    GRANT USAGE ON SCHEMA public TO ${APP_USER}, ${RO_USER};

    -- Default privileges for future tables created by twinedge_migrator
    ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_USER} IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};

    ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_USER} IN SCHEMA public
        GRANT SELECT ON TABLES TO ${RO_USER};

    ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_USER} IN SCHEMA public
        GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_USER};

    ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_USER} IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ${RO_USER};
EOSQL

echo "PostgreSQL roles configured successfully."
