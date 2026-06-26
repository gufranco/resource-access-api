import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import type { Database } from '../database/drizzle';
import { users } from '../database/schema';
import type { Role, UserContext } from './user-context';

export interface UserDirectory {
  findById(id: number): Promise<UserContext | null>;
}

export function toRole(value: string): Role | null {
  return value === 'member' || value === 'admin' ? value : null;
}

@Injectable()
export class DrizzleUserDirectory implements UserDirectory {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: number): Promise<UserContext | null> {
    const rows = await this.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    const role = toRole(row.role);
    /* v8 ignore next 3 -- role is constrained by a CHECK; the null branch is unreachable via the database */
    if (role === null) {
      return null;
    }
    return { id: row.id, role };
  }
}
