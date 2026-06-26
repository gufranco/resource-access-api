import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtVerifier } from './jwt-verifier';
import type { UserContext } from './user-context';

const verifier = {
  verify: (token: string): Promise<UserContext | null> =>
    Promise.resolve(token === 'good' ? { id: 1, role: 'admin' } : null),
} as unknown as JwtVerifier;

interface FakeRequest {
  user?: UserContext;
  header(name: string): string | undefined;
}

function makeContext(headers: Record<string, string>): {
  context: ExecutionContext;
  request: FakeRequest;
} {
  const request: FakeRequest = {
    header: (name: string): string | undefined => headers[name.toLowerCase()],
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { context, request };
}

function publicReflector(isPublic: boolean): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  it('allows public routes without a token', async () => {
    // Arrange
    const guard = new JwtAuthGuard(publicReflector(true), verifier);
    const { context } = makeContext({});

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('attaches the user for a valid bearer token', async () => {
    // Arrange
    const guard = new JwtAuthGuard(publicReflector(false), verifier);
    const { context, request } = makeContext({ authorization: 'Bearer good' });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 1, role: 'admin' });
  });

  it('rejects a missing authorization header with 401', async () => {
    // Arrange
    const guard = new JwtAuthGuard(publicReflector(false), verifier);
    const { context } = makeContext({});

    // Act
    const act = guard.canActivate(context);

    // Assert
    await expect(act).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-bearer scheme with 401', async () => {
    // Arrange
    const guard = new JwtAuthGuard(publicReflector(false), verifier);
    const { context } = makeContext({ authorization: 'Basic abc' });

    // Act
    const act = guard.canActivate(context);

    // Assert
    await expect(act).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token with 401', async () => {
    // Arrange
    const guard = new JwtAuthGuard(publicReflector(false), verifier);
    const { context } = makeContext({ authorization: 'Bearer bad' });

    // Act
    const act = guard.canActivate(context);

    // Assert
    await expect(act).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
