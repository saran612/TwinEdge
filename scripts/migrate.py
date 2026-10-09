#!/usr/bin/env python3
"""
Lightweight, robust PostgreSQL migration runner with advisory locks and SHA256 checksums.
Safe under concurrent executions. Plain SQL migrations in db/migrations/.
"""

import os
import sys
import glob
import hashlib
import psycopg

# Advisory lock key for migrations (arbitrary 64-bit int)
MIGRATION_ADVISORY_LOCK_ID = 8472910385719382

def compute_checksum(content: str) -> str:
    return hashlib.sha256(content.strip().encode("utf-8")).hexdigest()

def get_connection():
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = int(os.getenv("POSTGRES_PORT", "5432"))
    dbname = os.getenv("POSTGRES_DB", "twinedge")
    # Migrator user is used for DDL migrations
    user = os.getenv("POSTGRES_MIGRATOR_USER", "twinedge_migrator")
    password = os.getenv("POSTGRES_MIGRATOR_PASSWORD", "twinedge_migrator_secret")

    return psycopg.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password,
        autocommit=False
    )

def run_migrations(migrations_dir: str = "db/migrations") -> int:
    print(f"Connecting to Postgres to run migrations from {migrations_dir}...")
    try:
        conn = get_connection()
    except Exception as e:
        print(f"Error connecting to database: {e}", file=sys.stderr)
        return 1

    with conn:
        with conn.cursor() as cur:
            # Acquire transaction-level advisory lock
            print("Acquiring migration advisory lock...")
            cur.execute("SELECT pg_advisory_lock(%s);", (MIGRATION_ADVISORY_LOCK_ID,))

            try:
                # Ensure schema_migrations table exists
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version VARCHAR(50) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        checksum VARCHAR(64) NOT NULL,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
                    );
                """)

                # Fetch applied migrations
                cur.execute("SELECT version, checksum FROM schema_migrations;")
                applied = {row[0]: row[1] for row in cur.fetchall()}

                # Discover migration files
                files = sorted(glob.glob(os.path.join(migrations_dir, "V*__*.sql")))
                if not files:
                    print("No migration files found.")
                    return 0

                applied_count = 0
                for fpath in files:
                    filename = os.path.basename(fpath)
                    parts = filename.split("__", 1)
                    if len(parts) != 2:
                        continue
                    version = parts[0]
                    name = parts[1].replace(".sql", "")

                    with open(fpath, "r", encoding="utf-8") as f:
                        sql_content = f.read()
                    
                    chk = compute_checksum(sql_content)

                    if version in applied:
                        if applied[version] != chk:
                            raise RuntimeError(
                                f"Checksum mismatch for already applied migration {version}: "
                                f"recorded={applied[version]}, calculated={chk}"
                            )
                        print(f"  [OK] {version}__{name} already applied.")
                    else:
                        print(f"  [APPLYING] {version}__{name}...")
                        cur.execute(sql_content)
                        cur.execute(
                            "INSERT INTO schema_migrations (version, name, checksum) VALUES (%s, %s, %s);",
                            (version, name, chk)
                        )
                        applied_count += 1
                        print(f"  [DONE] {version}__{name} successfully applied.")

                conn.commit()
                print(f"Migrations finished successfully. {applied_count} new migrations applied.")
                return 0

            finally:
                cur.execute("SELECT pg_advisory_unlock(%s);", (MIGRATION_ADVISORY_LOCK_ID,))

if __name__ == "__main__":
    migrations_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "migrations"
    )
    sys.exit(run_migrations(migrations_path))
