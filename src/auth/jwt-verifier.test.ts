import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema';
import { JwtVerifier } from './jwt-verifier';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const ISSUER = 'https://issuer.test';
const AUDIENCE = 'resource-access-api';

function configWith(values: Partial<Record<keyof Env, unknown>>): ConfigService<Env, true> {
  return {
    get: (key: string): unknown => values[key as keyof Env],
  } as unknown as ConfigService<Env, true>;
}

async function signToken(claims: {
  sub?: string;
  role?: string;
  issuer?: string;
  audience?: string;
}): Promise<string> {
  const builder = new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m');
  if (claims.sub !== undefined) {
    builder.setSubject(claims.sub);
  }
  if (claims.issuer !== undefined) {
    builder.setIssuer(claims.issuer);
  }
  if (claims.audience !== undefined) {
    builder.setAudience(claims.audience);
  }
  return builder.sign(new TextEncoder().encode(SECRET));
}

const verifier = new JwtVerifier(
  configWith({ JWT_SECRET: SECRET, JWT_ISSUER: ISSUER, JWT_AUDIENCE: AUDIENCE }),
);

describe('JwtVerifier', () => {
  it('resolves a valid token into a user context', async () => {
    // Arrange
    const token = await signToken({ sub: '7', role: 'admin', issuer: ISSUER, audience: AUDIENCE });

    // Act
    const user = await verifier.verify(token);

    // Assert
    expect(user).toEqual({ id: 7, role: 'admin' });
  });

  it('rejects a token signed with the wrong secret', async () => {
    // Arrange
    const token = await new SignJWT({ role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('7')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('a-different-secret-value-32-bytes-xx'));

    // Act
    const user = await verifier.verify(token);

    // Assert
    expect(user).toBeNull();
  });

  it('rejects a token with an unknown role', async () => {
    // Arrange
    const token = await signToken({ sub: '7', role: 'root', issuer: ISSUER, audience: AUDIENCE });

    // Act
    const user = await verifier.verify(token);

    // Assert
    expect(user).toBeNull();
  });

  it('rejects a token with a non-numeric subject', async () => {
    // Arrange
    const token = await signToken({
      sub: 'abc',
      role: 'member',
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    // Act
    const user = await verifier.verify(token);

    // Assert
    expect(user).toBeNull();
  });

  it('returns null when JWKS resolution fails', async () => {
    // Arrange
    const jwksVerifier = new JwtVerifier(
      configWith({
        JWT_JWKS_URL: 'http://127.0.0.1:1/jwks',
        JWT_ISSUER: ISSUER,
        JWT_AUDIENCE: AUDIENCE,
      }),
    );
    const token = await signToken({ sub: '1', role: 'admin', issuer: ISSUER, audience: AUDIENCE });

    // Act
    const user = await jwksVerifier.verify(token);

    // Assert
    expect(user).toBeNull();
  });

  it('returns null when no key is configured', async () => {
    // Arrange
    const bareVerifier = new JwtVerifier(configWith({}));
    const token = await signToken({ sub: '1', role: 'admin', issuer: ISSUER, audience: AUDIENCE });

    // Act
    const user = await bareVerifier.verify(token);

    // Assert
    expect(user).toBeNull();
  });
});
