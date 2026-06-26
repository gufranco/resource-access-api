import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from 'jose';
import type { Env } from '../config/env.schema';
import { toRole } from './user-directory';
import type { UserContext } from './user-context';

type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

/**
 * Verifies a Bearer JWT and maps it to a UserContext. Supports a remote JWKS
 * (production, e.g. an external JWKS issuer) or a shared HS256 secret for
 * local development and tests. Returns null for any invalid token; the caller
 * maps that to 401.
 */
@Injectable()
export class JwtVerifier {
  private readonly logger = new Logger(JwtVerifier.name);
  private readonly jwks: JwksResolver | null;
  private readonly secret: Uint8Array | null;
  private readonly options: JWTVerifyOptions;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const jwksUrl = config.get('JWT_JWKS_URL', { infer: true });
    const secret = config.get('JWT_SECRET', { infer: true });
    this.jwks = jwksUrl !== undefined ? createRemoteJWKSet(new URL(jwksUrl)) : null;
    this.secret = secret !== undefined ? new TextEncoder().encode(secret) : null;
    const issuer = config.get('JWT_ISSUER', { infer: true });
    const audience = config.get('JWT_AUDIENCE', { infer: true });
    this.options = {
      ...(issuer !== undefined ? { issuer } : {}),
      ...(audience !== undefined ? { audience } : {}),
    };
  }

  async verify(token: string): Promise<UserContext | null> {
    try {
      const payload = await this.verifyWithConfiguredKey(token);
      if (payload === null) {
        return null;
      }
      const id = Number(payload.sub);
      const role = typeof payload.role === 'string' ? toRole(payload.role) : null;
      if (!Number.isInteger(id) || id <= 0 || role === null) {
        return null;
      }
      return { id, role };
    } catch (error: unknown) {
      this.logger.debug(`JWT verification failed: ${String(error)}`);
      return null;
    }
  }

  private async verifyWithConfiguredKey(
    token: string,
  ): Promise<{ sub?: string; role?: unknown } | null> {
    if (this.jwks !== null) {
      const { payload } = await jwtVerify(token, this.jwks, this.options);
      return payload;
    }
    if (this.secret !== null) {
      const { payload } = await jwtVerify(token, this.secret, this.options);
      return payload;
    }
    this.logger.warn('JWT auth mode is active but no JWKS URL or secret is configured');
    return null;
  }
}
