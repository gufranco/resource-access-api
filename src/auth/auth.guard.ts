import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, USER_DIRECTORY, USER_ID_HEADER } from './auth.constants';
import type { UserContext } from './user-context';
import type { UserDirectory } from './user-directory';

/**
 * Resolves the caller from the `x-user-id` header into a `UserContext` and
 * attaches it to the request. Scoped endpoints require an authenticated
 * identity, so a missing, malformed, or unknown user yields 401 rather than an
 * empty result. Routes marked `@Public()` skip resolution.
 *
 * The header stub stands in for real authentication. A production deployment
 * swaps this for a JWT/JWKS guard; the rest of the system depends only on the
 * resolved `UserContext`, not on how it was obtained.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_DIRECTORY) private readonly directory: UserDirectory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: UserContext }>();
    const header = request.header(USER_ID_HEADER);
    if (!header) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const id = Number(header);
    if (!Number.isInteger(id) || id <= 0) {
      throw new UnauthorizedException('Invalid x-user-id header');
    }

    const user = await this.directory.findById(id);
    if (!user) {
      throw new UnauthorizedException('Unknown user');
    }

    request.user = user;
    return true;
  }
}
