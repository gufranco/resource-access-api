import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserContext } from '../auth/user-context';
import { CacheService } from '../cache/cache.service';
import type { Env } from '../config/env.schema';
import type { ResourceRow } from '../database/schema';
import { canQueryUserResources, resolveVisibility } from './access-policy';
import type { ListResourcesQuery } from './dto/list-resources.query';
import {
  resourceSchema,
  type PaginatedResources,
  type ResourceView,
} from './dto/resource.response';
import { clampLimit, decodeCursor, encodeCursor, type Cursor } from './pagination';
import { ResourcesRepository } from './resources.repository';

const RECENT_LIMIT = 10;

/**
 * Orchestrates the three listing use cases over the single shared repository.
 * Each method resolves visibility, applies the per-endpoint scope, and returns
 * a standardized paginated envelope. Reads are cached per user and per query.
 */
@Injectable()
export class ResourcesService {
  private readonly defaultLimit: number;
  private readonly maxLimit: number;

  constructor(
    private readonly repository: ResourcesRepository,
    private readonly cache: CacheService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.defaultLimit = config.get('PAGINATION_DEFAULT_LIMIT', { infer: true });
    this.maxLimit = config.get('PAGINATION_MAX_LIMIT', { infer: true });
  }

  async listVisible(user: UserContext, query: ListResourcesQuery): Promise<PaginatedResources> {
    const cursor = this.parseCursor(query.cursor);
    const limit = clampLimit(query.limit, this.defaultLimit, this.maxLimit);
    const key = this.buildKey(user, 'visible', undefined, query, limit);
    return this.cache.getOrSet(key, async () => {
      const rows = await this.repository.list({
        visibility: resolveVisibility(user),
        ...(query.type !== undefined ? { type: query.type } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(cursor ? { cursor } : {}),
        limit: limit + 1,
      });
      return this.paginate(rows, limit);
    });
  }

  async listRecent(user: UserContext): Promise<PaginatedResources> {
    const key = this.buildKey(user, 'recent', undefined, {}, RECENT_LIMIT);
    return this.cache.getOrSet(key, async () => {
      const rows = await this.repository.list({
        visibility: resolveVisibility(user),
        limit: RECENT_LIMIT,
      });
      return {
        data: rows.map((row) => this.toView(row)),
        pageInfo: { nextCursor: null, hasMore: false, limit: RECENT_LIMIT },
      };
    });
  }

  async listOwnedBy(
    viewer: UserContext,
    targetUserId: number,
    query: ListResourcesQuery,
  ): Promise<PaginatedResources> {
    if (!canQueryUserResources(viewer, targetUserId)) {
      throw new ForbiddenException("You may not list another user's resources");
    }
    const cursor = this.parseCursor(query.cursor);
    const limit = clampLimit(query.limit, this.defaultLimit, this.maxLimit);
    const key = this.buildKey(viewer, 'owner', targetUserId, query, limit);
    return this.cache.getOrSet(key, async () => {
      const rows = await this.repository.list({
        visibility: resolveVisibility(viewer),
        ownerId: targetUserId,
        ...(query.type !== undefined ? { type: query.type } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(cursor ? { cursor } : {}),
        limit: limit + 1,
      });
      return this.paginate(rows, limit);
    });
  }

  private parseCursor(raw: string | undefined): Cursor | undefined {
    if (raw === undefined) {
      return undefined;
    }
    const cursor = decodeCursor(raw);
    if (!cursor) {
      throw new BadRequestException('Invalid cursor');
    }
    return cursor;
  }

  private paginate(rows: ResourceRow[], limit: number): PaginatedResources {
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;
    return {
      data: page.map((row) => this.toView(row)),
      pageInfo: { nextCursor, hasMore, limit },
    };
  }

  private toView(row: ResourceRow): ResourceView {
    return resourceSchema.parse({
      id: row.id,
      ownerId: row.ownerId,
      type: row.type,
      status: row.status,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private buildKey(
    user: UserContext,
    scope: string,
    ownerId: number | undefined,
    query: ListResourcesQuery,
    limit: number,
  ): string {
    return [
      'resources:v1',
      `u${user.id.toString()}`,
      user.role,
      scope,
      `owner=${ownerId?.toString() ?? ''}`,
      `t=${query.type ?? ''}`,
      `s=${query.status ?? ''}`,
      `c=${query.cursor ?? ''}`,
      `l=${limit.toString()}`,
    ].join(':');
  }
}
