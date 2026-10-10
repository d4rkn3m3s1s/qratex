/**
 * Yolculuk akışı — imleç ve k-yollu birleştirme (saf, jest ile test edilir).
 *
 * Eski zaman çizelgesi her kaynağı farklı pencereyle kesip (20/10/10/10) birleştiriyor,
 * 30'da kesiyor ve sayfalamıyordu: akışta boşluklar oluşuyor, aktif kullanıcıda ilk olaylar
 * hiç görünmüyordu (journey-score bulgu 7). Burada her kaynak aynı imleçle (`at ≤ imleç`)
 * okunur, sıralama `(at desc, key desc)` ile kesin ve imleç `(at, key)` çiftidir: aynı
 * milisaniyedeki olaylar da atlanmaz/tekrarlanmaz.
 */

export type Cursor = { at: string; key: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.at}|${c.key}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: unknown): Cursor | null {
  if (typeof raw !== 'string' || !raw || raw.length > 300) return null;
  let text: string;
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const i = text.indexOf('|');
  if (i <= 0) return null;
  const at = text.slice(0, i);
  const key = text.slice(i + 1);
  if (!key || key.length > 200 || Number.isNaN(Date.parse(at))) return null;
  return { at: new Date(at).toISOString(), key };
}

type Sortable = { at: string; key: string };

/** `(at desc, key desc)` karşılaştırıcısı. */
export function compareDesc(a: Sortable, b: Sortable): number {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return tb - ta;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

/** İmleçten SONRA gelen (daha eski) öğe mi? */
export function isAfterCursor(item: Sortable, cursor: Cursor | null): boolean {
  if (!cursor) return true;
  return compareDesc(cursor, item) < 0;
}

/**
 * Kaynak listelerini birleştirir. Her kaynak `at ≤ imleç.at` koşuluyla ve `take` kadar
 * okunmuş olmalıdır. Bir kaynak `take` kadar döndüyse orada daha fazlası olabilir.
 */
export function mergeJourney<T extends Sortable>(
  sources: ReadonlyArray<ReadonlyArray<T>>,
  cursor: Cursor | null,
  limit: number,
  take: number,
): { items: T[]; nextCursor: string | null } {
  const all: T[] = [];
  let maybeMore = false;
  for (const list of sources) {
    if (list.length >= take) maybeMore = true;
    for (const it of list) if (isAfterCursor(it, cursor)) all.push(it);
  }
  all.sort(compareDesc);
  const items = all.slice(0, limit);
  const hasMore = all.length > limit || (maybeMore && items.length > 0);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor({ at: last.at, key: last.key }) : null };
}
