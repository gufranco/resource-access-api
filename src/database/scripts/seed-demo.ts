import { faker } from '@faker-js/faker';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { RESOURCE_STATUSES, RESOURCE_TYPES, resourceShares, resources, users } from '../schema';

/**
 * Demo seed: 100 unique rows in every table, generated with faker. Seeded for
 * reproducibility. Uniqueness is guaranteed by construction: user and resource
 * ids are 1..100, and each share pairs a distinct resource with a user other
 * than its owner, so every (resource_id, user_id) pair is unique.
 *
 * This is separate from the deterministic functional seed (seed.ts), which the
 * test suite pins to exact rows. Run it for a richer local dataset.
 */

const COUNT = 100;
const BASE_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();
const ADMIN_EVERY = 10;

function loadEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Fall back to the ambient environment.
  }
}

function buildUsers(): typeof users.$inferInsert[] {
  return Array.from({ length: COUNT }, (_unused, index) => ({
    id: index + 1,
    name: faker.person.fullName(),
    role: index % ADMIN_EVERY === 0 ? 'admin' : 'member',
  }));
}

function buildResources(): typeof resources.$inferInsert[] {
  return Array.from({ length: COUNT }, (_unused, index) => {
    const createdAt = new Date(BASE_TIME + index * 3600 * 1000);
    return {
      id: index + 1,
      ownerId: faker.number.int({ min: 1, max: COUNT }),
      type: faker.helpers.arrayElement(RESOURCE_TYPES),
      status: faker.helpers.arrayElement(RESOURCE_STATUSES),
      title: faker.commerce.productName(),
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildShares(
  resourceRows: typeof resources.$inferInsert[],
): typeof resourceShares.$inferInsert[] {
  // One share per resource (distinct resource_id => the pair is always unique),
  // shared with the user after the owner so user_id is never the owner.
  return resourceRows.map((row) => ({
    resourceId: row.id,
    userId: ((row.ownerId) % COUNT) + 1,
  }));
}

async function seedDemo(): Promise<void> {
  loadEnv();
  faker.seed(20260626);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { users, resources, resourceShares } });
  try {
    await db.delete(resourceShares);
    await db.delete(resources);
    await db.delete(users);

    const userRows = buildUsers();
    const resourceRows = buildResources();
    const shareRows = buildShares(resourceRows);

    await db.insert(users).values(userRows);
    await db.insert(resources).values(resourceRows);
    await db.insert(resourceShares).values(shareRows);

    process.stdout.write(
      `seeded ${userRows.length.toString()} users, ${resourceRows.length.toString()} resources, ` +
        `${shareRows.length.toString()} shares\n`,
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedDemo().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
