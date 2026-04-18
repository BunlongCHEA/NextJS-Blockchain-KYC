/**
 * app/api/integration/lib/db.ts
 * ─────────────────────────────
 * PostgreSQL store for integration API keys.
 * Replaces the .int_keys_store.json file approach.
 *
 * Uses the same `DATABASE_URL` / `POSTGRES_URL` that the rest of the app uses.
 * No ORM — plain pg driver to keep it consistent with how the Go side manages its DB.
 *
 * Table: integration_api_keys
 * Created by the migration below — run once on first deploy.
 */

import { Pool, PoolClient } from "pg";

// ─── Types (mirror keys/page.tsx exactly) ─────────────────────────────────────

export type Scope =
  | "kyc:read"    | "kyc:write"   | "kyc:verify"
  | "users:read"  | "users:write"
  | "blockchain:read" | "blockchain:mine"
  | "banks:read"  | "banks:write"
  | "certificates:issue" | "certificates:verify"
  | "audit:read";

export interface IntegrationKey {
  id:                  string;
  name:                string;
  description:         string;
  organization:        string;
  key_prefix:          string;
  key_hash:            string;
  is_active:           boolean;
  is_deleted:          boolean;
  scopes:              Scope[];
  created_at:          number;   // Unix ms
  expires_at:          number;   // Unix ms  (0 = never)
  last_used_at:        number;   // Unix ms
  request_count:       number;
  request_count_today: number;
  scope_counts:        Partial<Record<Scope, number>>;
  scope_counts_today:  Partial<Record<Scope, number>>;
  _today_date?:        string;   // "Mon Jun 10 2025" — server-only field
}

// ─── Connection pool ──────────────────────────────────────────────────────────

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL  ??
    process.env.POSTGRES_PRISMA_URL;

  if (!url) {
    throw new Error(
      "No Postgres connection string found. " +
      "Set DATABASE_URL or POSTGRES_URL in .env.local"
    );
  }

  _pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    ssl: url.includes("sslmode=disable") || url.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  _pool.on("error", (err) => {
    console.error("[integration-db] pool error:", err.message);
  });

  return _pool;
}

// ─── Migration ────────────────────────────────────────────────────────────────
// Call once on app startup (idempotent — CREATE TABLE IF NOT EXISTS).

export async function runMigration(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_api_keys (
      id                  VARCHAR(36)   PRIMARY KEY,
      name                VARCHAR(255)  NOT NULL,
      description         TEXT          NOT NULL DEFAULT '',
      organization        VARCHAR(255)  NOT NULL DEFAULT '',
      key_prefix          VARCHAR(20)   NOT NULL,
      key_hash            VARCHAR(64)   NOT NULL UNIQUE,
      is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
      is_deleted          BOOLEAN       NOT NULL DEFAULT FALSE,
      scopes              TEXT[]        NOT NULL DEFAULT '{}',
      created_at          BIGINT        NOT NULL,
      expires_at          BIGINT        NOT NULL DEFAULT 0,
      last_used_at        BIGINT        NOT NULL DEFAULT 0,
      request_count       INTEGER       NOT NULL DEFAULT 0,
      request_count_today INTEGER       NOT NULL DEFAULT 0,
      today_date          VARCHAR(32)   NOT NULL DEFAULT '',
      scope_counts        JSONB         NOT NULL DEFAULT '{}',
      scope_counts_today  JSONB         NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_int_keys_hash      ON integration_api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_int_keys_is_active ON integration_api_keys(is_active);
    CREATE INDEX IF NOT EXISTS idx_int_keys_is_deleted ON integration_api_keys(is_deleted);
  `);
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToKey(row: any): IntegrationKey {
  return {
    id:                  row.id,
    name:                row.name,
    description:         row.description ?? "",
    organization:        row.organization ?? "",
    key_prefix:          row.key_prefix,
    key_hash:            row.key_hash,
    is_active:           row.is_active,
    is_deleted:          row.is_deleted,
    scopes:              (row.scopes ?? []) as Scope[],
    created_at:          Number(row.created_at),
    expires_at:          Number(row.expires_at),
    last_used_at:        Number(row.last_used_at),
    request_count:       Number(row.request_count),
    request_count_today: Number(row.request_count_today),
    scope_counts:        (row.scope_counts  ?? {}) as Partial<Record<Scope, number>>,
    scope_counts_today:  (row.scope_counts_today ?? {}) as Partial<Record<Scope, number>>,
    _today_date:         row.today_date ?? "",
  };
}

// ─── Read all keys ────────────────────────────────────────────────────────────

export async function readServerKeys(): Promise<IntegrationKey[]> {
  await runMigration();           // idempotent — fast no-op after first call
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM integration_api_keys ORDER BY created_at DESC`
  );
  return rows.map(rowToKey);
}

// ─── Read one key by hash (hot path — called on every API request) ────────────

export async function findKeyByHash(hash: string): Promise<IntegrationKey | null> {
  await runMigration();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM integration_api_keys WHERE key_hash = $1 LIMIT 1`,
    [hash]
  );
  return rows.length > 0 ? rowToKey(rows[0]) : null;
}

// ─── Upsert a single key (used by sync endpoint) ──────────────────────────────

export async function upsertKey(key: IntegrationKey): Promise<void> {
  await runMigration();
  const pool = getPool();
  await pool.query(`
    INSERT INTO integration_api_keys (
      id, name, description, organization, key_prefix, key_hash,
      is_active, is_deleted, scopes,
      created_at, expires_at, last_used_at,
      request_count, request_count_today, today_date,
      scope_counts, scope_counts_today
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,
      $10,$11,$12,
      $13,$14,$15,
      $16,$17
    )
    ON CONFLICT (id) DO UPDATE SET
      name                = EXCLUDED.name,
      description         = EXCLUDED.description,
      organization        = EXCLUDED.organization,
      key_prefix          = EXCLUDED.key_prefix,
      is_active           = EXCLUDED.is_active,
      is_deleted          = EXCLUDED.is_deleted,
      scopes              = EXCLUDED.scopes,
      expires_at          = EXCLUDED.expires_at,
      last_used_at        = EXCLUDED.last_used_at,
      request_count       = EXCLUDED.request_count,
      request_count_today = EXCLUDED.request_count_today,
      today_date          = EXCLUDED.today_date,
      scope_counts        = EXCLUDED.scope_counts,
      scope_counts_today  = EXCLUDED.scope_counts_today
    -- key_hash is immutable after creation — never updated
  `,
  [
    key.id,
    key.name,
    key.description ?? "",
    key.organization ?? "",
    key.key_prefix,
    key.key_hash,
    key.is_active,
    key.is_deleted,
    key.scopes,
    key.created_at,
    key.expires_at,
    key.last_used_at,
    key.request_count,
    key.request_count_today,
    key._today_date ?? "",
    JSON.stringify(key.scope_counts ?? {}),
    JSON.stringify(key.scope_counts_today ?? {}),
  ]);
}

// ─── Bulk sync (replaces full writeServerKeys) ────────────────────────────────
// Called by POST /api/integration/sync.
// Uses a transaction: upsert all provided keys (no deletes — soft-delete only).

export async function syncKeys(keys: IntegrationKey[]): Promise<void> {
  await runMigration();
  const pool   = getPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const key of keys) {
      await client.query(`
        INSERT INTO integration_api_keys (
          id, name, description, organization, key_prefix, key_hash,
          is_active, is_deleted, scopes,
          created_at, expires_at, last_used_at,
          request_count, request_count_today, today_date,
          scope_counts, scope_counts_today
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,
          $10,$11,$12,
          $13,$14,$15,
          $16,$17
        )
        ON CONFLICT (id) DO UPDATE SET
          name                = EXCLUDED.name,
          description         = EXCLUDED.description,
          organization        = EXCLUDED.organization,
          key_prefix          = EXCLUDED.key_prefix,
          is_active           = EXCLUDED.is_active,
          is_deleted          = EXCLUDED.is_deleted,
          scopes              = EXCLUDED.scopes,
          expires_at          = EXCLUDED.expires_at,
          last_used_at        = EXCLUDED.last_used_at,
          request_count       = EXCLUDED.request_count,
          request_count_today = EXCLUDED.request_count_today,
          today_date          = EXCLUDED.today_date,
          scope_counts        = EXCLUDED.scope_counts,
          scope_counts_today  = EXCLUDED.scope_counts_today
      `,
      [
        key.id, key.name, key.description ?? "", key.organization ?? "",
        key.key_prefix, key.key_hash,
        key.is_active, key.is_deleted, key.scopes,
        key.created_at, key.expires_at, key.last_used_at,
        key.request_count, key.request_count_today, key._today_date ?? "",
        JSON.stringify(key.scope_counts ?? {}),
        JSON.stringify(key.scope_counts_today ?? {}),
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Increment request stats (hot path — one query per API call) ──────────────
// Resets today's counters automatically when the date changes.

export async function incrementStats(keyId: string, scope: Scope): Promise<void> {
  const pool  = getPool();
  const today = new Date().toDateString();   // "Mon Jun 10 2025"

  await pool.query(`
    UPDATE integration_api_keys SET
      request_count       = request_count + 1,
      last_used_at        = $1,
      -- Reset today counters when date changes
      request_count_today = CASE
        WHEN today_date = $2 THEN request_count_today + 1
        ELSE 1
      END,
      today_date          = $2,
      scope_counts        = jsonb_set(
        scope_counts,
        ARRAY[$3],
        to_jsonb(COALESCE((scope_counts->>$3)::int, 0) + 1)
      ),
      scope_counts_today  = CASE
        WHEN today_date = $2
          THEN jsonb_set(
            scope_counts_today,
            ARRAY[$3],
            to_jsonb(COALESCE((scope_counts_today->>$3)::int, 0) + 1)
          )
        ELSE jsonb_build_object($3, 1)
      END
    WHERE id = $4
  `, [Date.now(), today, scope, keyId]);
}