import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.constants';
import { JwtVerifier } from './jwt-verifier';
import type { UserContext } from './user-context';

const BEARER_PREFIX = 'Bearer ';

/**
 * Production authentication path. Verifies a Bearer JWT through JwtVerifier and
 * attaches the resolved UserContext. Selected when AUTH_MODE is `jwt`. Public
 * routes skip verification.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
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
    const header = request.header('authorization');
    if (header?.startsWith(BEARER_PREFIX) !== true) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const user = await this.verifier.verify(header.slice(BEARER_PREFIX.length).trim());
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    request.user = user;
    return true;
  }
}
