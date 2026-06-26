export interface Cursor {
  readonly createdAt: Date;
  readonly id: number;
}

export function clampLimit(
  requested: number | undefined,
  defaultLimit: number,
  maxLimit: number,
): number {
  if (requested === undefined) {
    return defaultLimit;
  }
  return Math.min(maxLimit, Math.max(1, Math.floor(requested)));
}

export function encodeCursor(cursor: Cursor): string {
  const payload = JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof json !== 'object' || json === null) {
      return null;
    }
    const record = json as Record<string, unknown>;
    const createdAtRaw = record.c;
    const id = record.i;
    if (typeof createdAtRaw !== 'string' || typeof id !== 'number' || !Number.isInteger(id)) {
      return null;
    }
    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}
