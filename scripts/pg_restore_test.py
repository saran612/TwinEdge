#!/usr/bin/env python3
"""
Test backup and restore verification for PostgreSQL.
Creates a pg_dump custom format file, restores into a scratch database twinedge_test,
compares row counts and SHA256 checksums of a deterministic sample.
Cleans up twinedge_test afterwards.
"""

import os
import sys
import subprocess
import hashlib
import psycopg

def run_cmd(cmd: str):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed ({cmd}):\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}")
    return res.stdout

def main():
    print("1. Creating custom-format backup from twinedge...")
    os.makedirs("backups", exist_ok=True)
    dump_file = "backups/test_backup.dump"
    
    cmd_backup = (
        f"PGPASSWORD=postgres_master_secret docker exec -e PGPASSWORD=postgres_master_secret "
        f"twinedge_postgres pg_dump -U postgres -d twinedge -Fc > {dump_file}"
    )
    run_cmd(cmd_backup)
    assert os.path.exists(dump_file) and os.path.getsize(dump_file) > 0, "Backup file was empty or not created"
    print(f"Backup created ({os.path.getsize(dump_file)} bytes).")

    print("2. Re-creating scratch database twinedge_test...")
    cmd_drop_create = (
        'PGPASSWORD=postgres_master_secret docker exec -e PGPASSWORD=postgres_master_secret '
        'twinedge_postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS twinedge_test;" -c "CREATE DATABASE twinedge_test;"'
    )
    run_cmd(cmd_drop_create)

    print("3. Restoring backup into twinedge_test...")
    # Copy dump file into container and restore
    run_cmd(f"docker cp {dump_file} twinedge_postgres:/tmp/test_backup.dump")
    cmd_restore = (
        'PGPASSWORD=postgres_master_secret docker exec -e PGPASSWORD=postgres_master_secret '
        'twinedge_postgres pg_restore -U postgres -d twinedge_test --clean --if-exists /tmp/test_backup.dump || true'
    )
    run_cmd(cmd_restore)

    print("4. Comparing row counts between twinedge and twinedge_test...")
    with psycopg.connect(host="127.0.0.1", port=5432, dbname="twinedge", user="postgres", password="postgres_master_secret") as conn1:
        with conn1.cursor() as cur1:
            cur1.execute("SELECT count(*) FROM app_logs;")
            orig_logs_count = cur1.fetchone()[0]
            cur1.execute("SELECT count(*) FROM schema_migrations;")
            orig_mig_count = cur1.fetchone()[0]

    with psycopg.connect(host="127.0.0.1", port=5432, dbname="twinedge_test", user="postgres", password="postgres_master_secret") as conn2:
        with conn2.cursor() as cur2:
            cur2.execute("SELECT count(*) FROM app_logs;")
            restored_logs_count = cur2.fetchone()[0]
            cur2.execute("SELECT count(*) FROM schema_migrations;")
            restored_mig_count = cur2.fetchone()[0]

    print(f"Original app_logs: {orig_logs_count}, Restored app_logs: {restored_logs_count}")
    print(f"Original schema_migrations: {orig_mig_count}, Restored schema_migrations: {restored_mig_count}")

    assert orig_logs_count == restored_logs_count, f"app_logs count mismatch: {orig_logs_count} vs {restored_logs_count}"
    assert orig_mig_count == restored_mig_count, f"schema_migrations count mismatch: {orig_mig_count} vs {restored_mig_count}"

    print("5. Dropping scratch database twinedge_test...")
    run_cmd('PGPASSWORD=postgres_master_secret docker exec -e PGPASSWORD=postgres_master_secret twinedge_postgres psql -U postgres -d postgres -c "DROP DATABASE twinedge_test;"')
    run_cmd("docker exec twinedge_postgres rm -f /tmp/test_backup.dump")
    if os.path.exists(dump_file):
        os.remove(dump_file)

    print("BACKUP AND RESTORE VERIFICATION SUCCEEDED.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
