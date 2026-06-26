import { describe, expect, it } from 'vitest';
import { canQueryUserResources, resolveVisibility } from './access-policy';
import type { UserContext } from '../auth/user-context';

const admin: UserContext = { id: 1, role: 'admin' };
const member: UserContext = { id: 2, role: 'member' };

describe('resolveVisibility', () => {
  it('grants an admin unrestricted visibility', () => {
    // Arrange
    const user = admin;

    // Act
    const scope = resolveVisibility(user);

    // Assert
    expect(scope).toEqual({ kind: 'all' });
  });

  it('restricts a member to owned-or-shared resources', () => {
    // Arrange
    const user = member;

    // Act
    const scope = resolveVisibility(user);

    // Assert
    expect(scope).toEqual({ kind: 'ownerOrShared', userId: 2 });
  });
});

describe('canQueryUserResources', () => {
  it('allows an admin to query any user', () => {
    // Arrange
    const viewer = admin;

    // Act
    const allowed = canQueryUserResources(viewer, 999);

    // Assert
    expect(allowed).toBe(true);
  });

  it('allows a member to query their own resources', () => {
    // Arrange
    const viewer = member;

    // Act
    const allowed = canQueryUserResources(viewer, 2);

    // Assert
    expect(allowed).toBe(true);
  });

  it('forbids a member from querying another user', () => {
    // Arrange
    const viewer = member;

    // Act
    const allowed = canQueryUserResources(viewer, 3);

    // Assert
    expect(allowed).toBe(false);
  });
});
