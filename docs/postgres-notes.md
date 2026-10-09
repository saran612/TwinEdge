# PostgreSQL Schema, Indexing & EXPLAIN Notes

## 1. Why this Schema and Indexing Strategy?
- **Keyset Pagination on `(ts DESC, id DESC)`**:
  Traditional `OFFSET / LIMIT` pagination suffers from $O(N)$ scanning on large tables. Indexing on `(ts DESC)` with secondary primary key tie-breaker `(id DESC)` allows instant $O(\log N)$ seeks for keyset pagination.
- **GIN Index on `data jsonb_path_ops`**:
  `jsonb_path_ops` indexes only path hashes for `@>` lookups, resulting in significantly smaller index sizes (~60% smaller than default `jsonb_ops`) and faster indexing throughput for arbitrary query attributes (such as `data ? 'latency_ms'`).
- **Partial Unique Index on `(source, device_id, seq, event) WHERE seq IS NOT NULL`**:
  Edge nodes retry transmission during intermittent connectivity. Creating a partial unique index where sequence numbers exist ensures deduplication without imposing sequence constraints on unsequenced internal backend logs.

## 2. Reading EXPLAIN (ANALYZE, BUFFERS)
When inspecting query plans:
- **Index Scans vs Sequential Scans**: On small tables (<5,000 rows), the PostgreSQL planner often selects sequential scans because sequential reading of cached memory pages (buffers `shared hit=122`) has lower cost than jumping between index pages and heap pages.
- **Buffers (Shared Hit)**: Indicates that all requested database blocks were read directly from PostgreSQL shared memory buffers (`shared_buffers = 128MB`), with 0 disk reads.

## 3. Why Logs Here and Not the Cryptographic Audit Chain?
- Logs and events have high throughput, variable structures, and natural retention horizons (e.g. 14 days).
- The MRO Audit Chain (`audit_trail`) is an append-only, tamper-evident cryptographic ledger where every sign-off and alert transition is tied to previous row hashes. Storing the audit ledger on a volatile, auto-expiring log store would violate non-repudiation and auditability guarantees.
