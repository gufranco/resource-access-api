import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'migrations');

function loadEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Fall back to the ambient environment (Docker, CI).
  }
}

function out(message: string): void {
  process.stdout.write(`${message}\n`);
}

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function splitStatements(sql: string): string[] {
  return stripComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function applyConcurrent(pool: Pool, sql: string): Promise<void> {
  for (const statement of splitStatements(sql)) {
    await pool.query(statement);
  }
}

async function applyTransactional(pool: Pool, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const appliedRows = await pool.query<{ name: string }>('SELECT name FROM _migrations');
    const applied = new Set(appliedRows.rows.map((row) => row.name));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        out(`skip ${file}`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      if (sql.includes('@concurrent')) {
        await applyConcurrent(pool, sql);
      } else {
        await applyTransactional(pool, sql);
      }
      await pool.query('INSERT INTO _migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      out(`applied ${file}`);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
