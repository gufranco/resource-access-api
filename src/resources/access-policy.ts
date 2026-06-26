import type { UserContext } from '../auth/user-context';

/**
 * Visibility scope for the shared resource-listing path.
 *
 * - `all`: no row filtering. Admins see every resource.
 * - `ownerOrShared`: a member sees only resources they own or that are shared
 *   with them through `resource_shares`.
 *
 * Modeling this as a discriminated union keeps the policy decision (here) fully
 * separate from its SQL translation (in the repository), so the rule that
 * governs all three endpoints lives in one tested place.
 */
export type VisibilityScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'ownerOrShared'; readonly userId: number };

export function resolveVisibility(user: UserContext): VisibilityScope {
  if (user.role === 'admin') {
    return { kind: 'all' };
  }
  return { kind: 'ownerOrShared', userId: user.id };
}

/**
 * Authorization for `GET /users/:userId/resources`. Only the user themselves or
 * an admin may list a user's owned resources. A member asking for another
 * user's resources is rejected, which closes the enumeration hole in the
 * baseline. Rejected alternative: returning the viewer-visible intersection,
 * which conflates "owned by target" with "visible to viewer" and surprises
 * callers.
 */
export function canQueryUserResources(viewer: UserContext, targetUserId: number): boolean {
  return viewer.role === 'admin' || viewer.id === targetUserId;
}
