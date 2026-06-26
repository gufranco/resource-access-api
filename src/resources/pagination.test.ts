import { describe, expect, it } from 'vitest';
import { clampLimit, decodeCursor, encodeCursor } from './pagination';

describe('clampLimit', () => {
  it('falls back to the default when no limit is given', () => {
    // Arrange
    const requested = undefined;

    // Act
    const limit = clampLimit(requested, 20, 100);

    // Assert
    expect(limit).toBe(20);
  });

  it('caps the limit at the maximum', () => {
    // Arrange
    const requested = 500;

    // Act
    const limit = clampLimit(requested, 20, 100);

    // Assert
    expect(limit).toBe(100);
  });

  it('keeps a valid in-range limit', () => {
    // Arrange
    const requested = 42;

    // Act
    const limit = clampLimit(requested, 20, 100);

    // Assert
    expect(limit).toBe(42);
  });
});

describe('cursor encode and decode', () => {
  it('round-trips a created_at and id', () => {
    // Arrange
    const createdAt = new Date('2024-01-01T05:00:00.000Z');
    const id = 17;

    // Act
    const decoded = decodeCursor(encodeCursor({ createdAt, id }));

    // Assert
    expect(decoded).toEqual({ createdAt, id });
  });

  it('returns null for a malformed cursor', () => {
    // Arrange
    const raw = 'not-a-real-cursor';

    // Act
    const decoded = decodeCursor(raw);

    // Assert
    expect(decoded).toBeNull();
  });

  it('returns null when the decoded payload has a bad shape', () => {
    // Arrange
    const raw = Buffer.from(JSON.stringify({ c: 'nope', i: 'x' }), 'utf8').toString('base64url');

    // Act
    const decoded = decodeCursor(raw);

    // Assert
    expect(decoded).toBeNull();
  });

  it('returns null when the payload is not an object', () => {
    // Arrange
    const raw = Buffer.from('5', 'utf8').toString('base64url');

    // Act
    const decoded = decodeCursor(raw);

    // Assert
    expect(decoded).toBeNull();
  });

  it('returns null when the timestamp is unparseable', () => {
    // Arrange
    const raw = Buffer.from(JSON.stringify({ c: 'not-a-date', i: 5 }), 'utf8').toString(
      'base64url',
    );

    // Act
    const decoded = decodeCursor(raw);

    // Assert
    expect(decoded).toBeNull();
  });
});
