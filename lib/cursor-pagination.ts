/**
 * Cursor-based pagination for heavy lists.
 * Use cursor + take instead of skip for stable performance on large tables.
 */
export function parseCursor(cursor: string | null): { id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { id: string };
    return parsed?.id ? { id: parsed.id } : undefined;
  } catch {
    return undefined;
  }
}

export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}
