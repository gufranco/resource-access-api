import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const baseEnv = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/resource_access',
};

describe('validateEnv', () => {
  it('applies defaults when only required vars are present', () => {
    // Arrange
    const raw = { ...baseEnv };

    // Act
    const env = validateEnv(raw);

    // Assert
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CACHE_ENABLED).toBe(true);
    expect(env.PAGINATION_DEFAULT_LIMIT).toBe(20);
    expect(env.PAGINATION_MAX_LIMIT).toBe(100);
    expect(env.AUTH_MODE).toBe('header');
    expect(env.METRICS_ENABLED).toBe(true);
    expect(env.OTEL_ENABLED).toBe(false);
  });

  it('coerces numeric strings into numbers', () => {
    // Arrange
    const raw = { ...baseEnv, PORT: '8080', RATE_LIMIT_MAX: '250' };

    // Act
    const env = validateEnv(raw);

    // Assert
    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_MAX).toBe(250);
  });

  it('parses CACHE_ENABLED=false as a boolean false', () => {
    // Arrange
    const raw = { ...baseEnv, CACHE_ENABLED: 'false' };

    // Act
    const env = validateEnv(raw);

    // Assert
    expect(env.CACHE_ENABLED).toBe(false);
  });

  it('rejects a missing DATABASE_URL', () => {
    // Arrange
    const raw = {};

    // Act
    const act = (): unknown => validateEnv(raw);

    // Assert
    expect(act).toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    // Arrange
    const raw = { ...baseEnv, PORT: 'not-a-number' };

    // Act
    const act = (): unknown => validateEnv(raw);

    // Assert
    expect(act).toThrow();
  });

  it('rejects a PORT outside the valid range', () => {
    // Arrange
    const raw = { ...baseEnv, PORT: '70000' };

    // Act
    const act = (): unknown => validateEnv(raw);

    // Assert
    expect(act).toThrow();
  });
});
