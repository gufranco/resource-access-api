import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../database/scripts/migrate';
import { seed } from '../database/scripts/seed';
import * as schema from '../database/schema';
import { DrizzleUserDirectory, toRole } from './user-directory';

describe('toRole', () => {
  it('accepts known roles', () => {
    // Arrange
    const value = 'admin';

    // Act
    const role = toRole(value);

    // Assert
    expect(role).toBe('admin');
  });

  it('rejects an unknown role', () => {
    // Arrange
    const value = 'superuser';

    // Act
    const role = toRole(value);

    // Assert
    expect(role).toBeNull();
  });
});

describe('DrizzleUserDirectory', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const directory = new DrizzleUserDirectory(drizzle(pool, { schema }));

  beforeAll(async () => {
    await migrate();
    await seed();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('resolves a seeded admin', async () => {
    // Arrange
    const id = 1;

    // Act
    const user = await directory.findById(id);

    // Assert
    expect(user).toEqual({ id: 1, role: 'admin' });
  });

  it('returns null for an unknown user', async () => {
    // Arrange
    const id = 999;

    // Act
    const user = await directory.findById(id);

    // Assert
    expect(user).toBeNull();
  });
});
