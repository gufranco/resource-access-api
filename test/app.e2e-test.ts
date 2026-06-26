import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { migrate } from '../src/database/scripts/migrate';
import { seed } from '../src/database/scripts/seed';

const ADMIN = '1';
const MEMBER_BOB = '2';
const MEMBER_CAROL = '3';

interface ResourceView {
  id: number;
  ownerId: number;
  type: string;
  status: string;
}

interface PaginatedBody {
  data: ResourceView[];
  pageInfo: { nextCursor: string | null; hasMore: boolean; limit: number };
}

describe('Resources API (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    await migrate();
    await seed();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('rejects a request with no x-user-id header', async () => {
      // Arrange
      const path = '/resources';

      // Act
      const res = await request(server).get(path);

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects a non-numeric x-user-id', async () => {
      // Arrange
      const header = 'abc';

      // Act
      const res = await request(server).get('/resources').set('x-user-id', header);

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects an unknown user', async () => {
      // Arrange
      const header = '999';

      // Act
      const res = await request(server).get('/resources').set('x-user-id', header);

      // Assert
      expect(res.status).toBe(401);
    });
  });

  describe('GET /resources visibility', () => {
    it('returns every resource for an admin', async () => {
      // Arrange
      const limit = 100;

      // Act
      const res = await request(server)
        .get(`/resources?limit=${limit.toString()}`)
        .set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data).toHaveLength(30);
    });

    it('restricts a member to owned-or-shared resources', async () => {
      // Arrange
      const limit = 100;

      // Act
      const res = await request(server)
        .get(`/resources?limit=${limit.toString()}`)
        .set('x-user-id', MEMBER_BOB);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      const ids = body.data.map((row) => row.id);
      expect(ids).toContain(1);
      expect(ids).not.toContain(3);
      expect(body.data.every((row) => row.ownerId === 2 || row.id === 1 || row.id === 10)).toBe(
        true,
      );
    });
  });

  describe('GET /resources filtering', () => {
    it('filters by type', async () => {
      // Arrange
      const type = 'doc';

      // Act
      const res = await request(server)
        .get(`/resources?type=${type}&limit=100`)
        .set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data.every((row) => row.type === 'doc')).toBe(true);
    });

    it('filters by status', async () => {
      // Arrange
      const status = 'published';

      // Act
      const res = await request(server)
        .get(`/resources?status=${status}&limit=100`)
        .set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data.every((row) => row.status === 'published')).toBe(true);
    });

    it('rejects an invalid type with 400', async () => {
      // Arrange
      const type = 'bogus';

      // Act
      const res = await request(server).get(`/resources?type=${type}`).set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(400);
    });

    it('rejects an unknown query parameter with 400', async () => {
      // Arrange
      const param = 'unexpected=1';

      // Act
      const res = await request(server).get(`/resources?${param}`).set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(400);
    });

    it('rejects a non-positive limit with 400', async () => {
      // Arrange
      const limit = 0;

      // Act
      const res = await request(server)
        .get(`/resources?limit=${limit.toString()}`)
        .set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(400);
    });

    it('rejects a malformed cursor with 400', async () => {
      // Arrange
      const cursor = 'not-a-cursor';

      // Act
      const res = await request(server).get(`/resources?cursor=${cursor}`).set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('GET /resources keyset pagination', () => {
    it('walks every page without duplicates, newest first', async () => {
      // Arrange
      let collected: ResourceView[] = [];
      let cursor: string | null = null;
      let keepGoing = true;

      // Act
      for (let page = 0; page < 10 && keepGoing; page += 1) {
        const query: string =
          `/resources?limit=10` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
        const res = await request(server).get(query).set('x-user-id', ADMIN);
        const body = res.body as PaginatedBody;
        collected = [...collected, ...body.data];
        keepGoing = body.pageInfo.hasMore;
        cursor = body.pageInfo.nextCursor;
      }

      // Assert
      expect(collected).toHaveLength(30);
      expect(new Set(collected.map((row) => row.id)).size).toBe(30);
      expect(
        collected.every((row, index) => index === 0 || (collected[index - 1]?.id ?? 0) > row.id),
      ).toBe(true);
    });
  });

  describe('GET /resources/recent', () => {
    it('returns at most ten visible resources', async () => {
      // Arrange
      const path = '/resources/recent';

      // Act
      const res = await request(server).get(path).set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data).toHaveLength(10);
    });
  });

  describe('GET /users/:userId/resources', () => {
    it('lets a member list their own resources', async () => {
      // Arrange
      const userId = MEMBER_BOB;

      // Act
      const res = await request(server)
        .get(`/users/${userId}/resources?limit=100`)
        .set('x-user-id', MEMBER_BOB);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data.every((row) => row.ownerId === 2)).toBe(true);
    });

    it('lets an admin list any user resources', async () => {
      // Arrange
      const userId = MEMBER_CAROL;

      // Act
      const res = await request(server)
        .get(`/users/${userId}/resources?limit=100`)
        .set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data.every((row) => row.ownerId === 3)).toBe(true);
    });

    it('forbids a member from listing another user resources', async () => {
      // Arrange
      const userId = MEMBER_CAROL;

      // Act
      const res = await request(server)
        .get(`/users/${userId}/resources`)
        .set('x-user-id', MEMBER_BOB);

      // Assert
      expect(res.status).toBe(403);
    });

    it('returns only matching rows for a filtered owner query', async () => {
      // Arrange
      const userId = MEMBER_BOB;

      // Act
      const res = await request(server)
        .get(`/users/${userId}/resources?type=doc&status=archived&limit=100`)
        .set('x-user-id', MEMBER_BOB);

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as PaginatedBody;
      expect(body.data.every((row) => row.type === 'doc' && row.status === 'archived')).toBe(true);
    });

    it('rejects a non-numeric userId with 400', async () => {
      // Arrange
      const userId = 'abc';

      // Act
      const res = await request(server).get(`/users/${userId}/resources`).set('x-user-id', ADMIN);

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('health', () => {
    it('reports liveness without auth', async () => {
      // Arrange
      const path = '/health/live';

      // Act
      const res = await request(server).get(path);

      // Assert
      expect(res.status).toBe(200);
    });

    it('reports readiness with database and Redis', async () => {
      // Arrange
      const path = '/health/ready';

      // Act
      const res = await request(server).get(path);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    });
  });

  describe('observability', () => {
    it('exposes Prometheus metrics without auth', async () => {
      // Arrange
      const path = '/metrics';

      // Act
      const res = await request(server).get(path);

      // Assert
      expect(res.status).toBe(200);
      expect(res.text).toContain('http_request_duration_seconds');
    });
  });
});
