import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { RESOURCE_STATUSES, RESOURCE_TYPES, resourceShares, resources, users } from '../schema';

/**
 * Deterministic functional seed. Ids, counts, and shares are fixed so the test
 * suite can assert exact rows. The randomized, high-volume dataset used for
 * EXPLAIN evidence lives in seed-bench.ts and is kept entirely separate.
 */

function loadEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Fall back to the ambient environment.
  }
}

const USERS = [
  { id: 1, name: 'Alice Admin', role: 'admin' },
  { id: 2, name: 'Bob Member', role: 'member' },
  { id: 3, name: 'Carol Member', role: 'member' },
  { id: 4, name: 'Dave Member', role: 'member' },
] as const;

const RESOURCE_COUNT = 30;
const BASE_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();

const SHARES = [
  { resourceId: 1, userId: 2 },
  { resourceId: 2, userId: 3 },
  { resourceId: 5, userId: 4 },
  { resourceId: 10, userId: 2 },
  { resourceId: 14, userId: 3 },
] as const;

function buildResources(): (typeof resources.$inferInsert)[] {
  return Array.from({ length: RESOURCE_COUNT }, (_unused, index) => {
    const i = index + 1;
    const ownerId = ((i - 1) % USERS.length) + 1;
    const type = RESOURCE_TYPES[(i - 1) % RESOURCE_TYPES.length] ?? 'doc';
    const status = RESOURCE_STATUSES[(i - 1) % RESOURCE_STATUSES.length] ?? 'draft';
    const createdAt = new Date(BASE_TIME + i * 3600 * 1000);
    return {
      id: i,
      ownerId,
      type,
      status,
      title: `${type} #${i.toString()}`,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

export async function seed(): Promise<void> {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { users, resources, resourceShares } });
  try {
    await db.delete(resourceShares);
    await db.delete(resources);
    await db.delete(users);
    await db.insert(users).values(USERS.map((user) => ({ ...user })));
    await db.insert(resources).values(buildResources());
    await db.insert(resourceShares).values(SHARES.map((share) => ({ ...share })));
    process.stdout.write(
      `seeded ${USERS.length.toString()} users, ${RESOURCE_COUNT.toString()} resources, ` +
        `${SHARES.length.toString()} shares\n`,
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
