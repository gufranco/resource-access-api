import { faker } from '@faker-js/faker';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { RESOURCE_STATUSES, RESOURCE_TYPES, resourceShares, resources, users } from '../schema';

/**
 * High-volume, randomized dataset for EXPLAIN ANALYZE evidence. Postgres
 * correctly prefers a sequential scan on the 30-row functional seed, so index
 * usage is demonstrated against this larger dataset. Rows use ids at or above
 * BENCH_OFFSET to stay separate from the deterministic functional seed.
 */

const BENCH_OFFSET = 1_000_000;
const CHUNK = 5_000;
const PER_SCALE = 50_000;
const OWNER_COUNT = 4;

function loadEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Fall back to the ambient environment.
  }
}

function scale(): number {
  const parsed = Number(process.env.SEED_SCALE ?? '1');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function seedBench(): Promise<void> {
  loadEnv();
  faker.seed(1234);
  const total = scale() * PER_SCALE;
  const base = new Date('2020-01-01T00:00:00.000Z').getTime();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { users, resources, resourceShares } });

  try {
    const owners = Array.from({ length: OWNER_COUNT }, (_unused, index) => ({
      id: index + 1,
      name: faker.person.fullName(),
      role: index === 0 ? 'admin' : 'member',
    }));
    await db.insert(users).values(owners).onConflictDoNothing();

    let inserted = 0;
    while (inserted < total) {
      const size = Math.min(CHUNK, total - inserted);
      const rows = Array.from({ length: size }, (_unused, offset) => {
        const i = inserted + offset;
        const type = RESOURCE_TYPES[i % RESOURCE_TYPES.length] ?? 'doc';
        const status = RESOURCE_STATUSES[i % RESOURCE_STATUSES.length] ?? 'draft';
        const createdAt = new Date(base + i * 1000);
        return {
          id: BENCH_OFFSET + i,
          ownerId: (i % OWNER_COUNT) + 1,
          type,
          status,
          title: faker.lorem.words(3),
          createdAt,
          updatedAt: createdAt,
        };
      });
      await db.insert(resources).values(rows).onConflictDoNothing();
      const shares = rows
        .filter((_row, offset) => (inserted + offset) % 10 === 0)
        .map((row) => ({ resourceId: row.id, userId: (row.id % OWNER_COUNT) + 1 }));
      if (shares.length > 0) {
        await db.insert(resourceShares).values(shares).onConflictDoNothing();
      }
      inserted += size;
      process.stdout.write(`bench inserted ${inserted.toString()}/${total.toString()}\n`);
    }
  } finally {
    await pool.end();
  }
}

seedBench().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
