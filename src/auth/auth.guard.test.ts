import type { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard';
import type { UserContext } from './user-context';
import type { UserDirectory } from './user-directory';

const directory: UserDirectory = {
  findById: (id: number): Promise<UserContext | null> =>
    Promise.resolve(id === 2 ? { id: 2, role: 'member' } : null),
};

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

describe('AuthGuard', () => {
  it('allows public routes without a header', async () => {
    // Arrange
    const guard = new AuthGuard(publicReflector(true), directory);
    const { context } = makeContext({});

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('attaches the resolved user for a valid header', async () => {
    // Arrange
    const guard = new AuthGuard(publicReflector(false), directory);
    const { context, request } = makeContext({ 'x-user-id': '2' });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 2, role: 'member' });
  });

  it('rejects a missing header with 401', async () => {
    // Arrange
    const guard = new AuthGuard(publicReflector(false), directory);
    const { context } = makeContext({});

    // Act
    const act = guard.canActivate(context);

    // Assert
    await expect(act).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-numeric header with 401', async () => {
    // Arrange
    const guard = new AuthGuard(publicReflector(false), directory);
    const { context } = makeContext({ 'x-user-id': 'abc' });

    // Act
    const act = guard.canActivate(context);

    // Assert
    await expect(act).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown user with 401', async () => {
    // Arrange
    const guard = new AuthGuard(publicReflector(false), directory);
    const { context } = makeContext({ 'x-user-id': '999' });

    // Act
    const act = guard.canActivate(context);

    // Assert
    await expect(act).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
