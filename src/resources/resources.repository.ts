import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import type { Database } from '../database/drizzle';
import { resourceShares, resources, type ResourceRow } from '../database/schema';
import type { VisibilityScope } from './access-policy';
import type { Cursor } from './pagination';

export interface ListResourcesParams {
  readonly visibility: VisibilityScope;
  readonly ownerId?: number;
  readonly type?: string;
  readonly status?: string;
  readonly cursor?: Cursor;
  readonly limit: number;
}

/**
 * Single shared data-access path for all three listing endpoints. Visibility,
 * owner scoping, filters, and keyset pagination compose into one query so the
 * access-control rule cannot be bypassed by any caller.
 */
@Injectable()
export class ResourcesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(params: ListResourcesParams): Promise<ResourceRow[]> {
    const visibility =
      params.visibility.kind === 'ownerOrShared'
        ? sql`(${resources.ownerId} = ${params.visibility.userId} OR EXISTS (SELECT 1 FROM ${resourceShares} WHERE ${resourceShares.resourceId} = ${resources.id} AND ${resourceShares.userId} = ${params.visibility.userId}))`
        : undefined;

    const conditions = [
      visibility,
      params.ownerId !== undefined ? eq(resources.ownerId, params.ownerId) : undefined,
      params.type !== undefined ? eq(resources.type, params.type) : undefined,
      params.status !== undefined ? eq(resources.status, params.status) : undefined,
      params.cursor
        ? sql`(${resources.createdAt}, ${resources.id}) < (${params.cursor.createdAt}, ${params.cursor.id})`
        : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return this.db
      .select()
      .from(resources)
      .where(where)
      .orderBy(desc(resources.createdAt), desc(resources.id))
      .limit(params.limit);
  }
}
