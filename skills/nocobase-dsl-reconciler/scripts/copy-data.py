#!/usr/bin/env python3
"""Copy data from source CRM tables to crm-copy tables.

Strategy:
- Identify all `*_copy` tables that have a source counterpart (strip suffix).
- Match columns by intersection (Copy schema may have fewer/wider fields).
- Truncate target, copy in any order with constraints deferred — IDs preserved
  so FK references stay consistent between parent/child tables.
- Per-table transactions: one table's failure doesn't kill the rest.

Env vars (optional):
  PG_DSN  full DSN string, default matches local NB compose (port 5435).

Exit code: 0 if every kept pair matched row counts; 1 if any mismatches.
"""
import os, sys
import psycopg2

DSN = os.environ.get('PG_DSN', 'dbname=nocobase user=nocobase password=nocobase host=localhost port=5435')

conn = psycopg2.connect(DSN)
conn.autocommit = True  # per-table transactions below
cur = conn.cursor()

cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE '%\\_copy' ESCAPE '\\'
    ORDER BY table_name
""")
copy_tables = [r[0] for r in cur.fetchall() if r[0] != 'pg_stat_progress_copy']

print(f"Found {len(copy_tables)} _copy tables")

def source_of(copy_name):
    return copy_name[:-len('_copy')]

pairs = []
for t in copy_tables:
    src = source_of(t)
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s", (src,))
    if cur.fetchone():
        pairs.append((src, t))
    else:
        print(f"  - skip {t}: no source {src}")

print(f"\nCopying data for {len(pairs)} table pair(s):\n")

total_copied = 0
for src, tgt in pairs:
    cur.execute("""
        SELECT column_name, data_type, character_maximum_length FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
    """, (src,))
    src_meta = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    cur.execute("""
        SELECT column_name, data_type, character_maximum_length FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
    """, (tgt,))
    tgt_meta = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    common = sorted(set(src_meta) & set(tgt_meta))
    if not common:
        print(f"  ! {tgt}: no common columns with {src}")
        continue

    # Cast source values to fit target column type/length. Two drift patterns:
    #   varchar(N) → varchar(M) with M<N    → LEFT(col, M)
    #   text / jsonb → varchar(N)           → cast to text first, then LEFT.
    # Without these, INSERT fails on one row and the whole table is skipped.
    select_exprs = []
    for c in common:
        s_type, s_len = src_meta[c]
        t_type, t_len = tgt_meta[c]
        if s_type == 'character varying' and t_type == 'character varying' and t_len and (not s_len or s_len > t_len):
            select_exprs.append(f'LEFT("{c}", {t_len})')
        elif t_type == 'character varying' and t_len and s_type in ('text', 'jsonb'):
            select_exprs.append(f'LEFT("{c}"::text, {t_len})')
        else:
            select_exprs.append(f'"{c}"')
    cols = ','.join(f'"{c}"' for c in common)
    select_clause = ','.join(select_exprs)

    try:
        cur.execute('BEGIN')
        cur.execute("SET CONSTRAINTS ALL DEFERRED")
        cur.execute("SET LOCAL session_replication_role = 'replica'")
        cur.execute(f'TRUNCATE TABLE "{tgt}" CASCADE')
        cur.execute(f'INSERT INTO "{tgt}" ({cols}) SELECT {select_clause} FROM "{src}"')
        n = cur.rowcount
        cur.execute('COMMIT')
        print(f"  + {tgt}: copied {n} row(s) from {src} ({len(common)} cols)")
        total_copied += n
    except Exception as e:
        try:
            cur.execute('ROLLBACK')
        except Exception:
            pass
        print(f"  ✗ {tgt}: {str(e)[:200]}")

print(f"\nDone: {total_copied} total row(s) copied across {len(pairs)} table(s)")

mismatches = 0
print("\nVerification:")
for src, tgt in pairs:
    cur.execute(f'SELECT count(*) FROM "{src}"')
    s = cur.fetchone()[0]
    cur.execute(f'SELECT count(*) FROM "{tgt}"')
    t = cur.fetchone()[0]
    if s != t:
        mismatches += 1
    mark = "✓" if s == t else "⚠"
    print(f"  {mark} {tgt}: {t} (source {src}: {s})")

conn.close()
sys.exit(1 if mismatches else 0)
