/**
 * Anahtar kümesi (keyset) imleci: `(createdAt, id)` çiftinin base64url hâli.
 * Ofset sayfalaması yerine imleç: yeni kayıt eklendiğinde liste kaymaz, sayfa atlanmaz.
 * Saf modül; bozuk/elle yazılmış imleç `null` döner (sunucu ilk sayfayı verir).
 */

export type Cursor = { at: Date; id: string };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function encodeCursor(at: Date | string, id: string): string {
  const iso = (at instanceof Date ? at : new Date(at)).toISOString();
  return toBase64Url(`${iso}|${id}`);
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return null;
  try {
    const text = fromBase64Url(raw);
    const sep = text.indexOf('|');
    if (sep <= 0) return null;
    const at = new Date(text.slice(0, sep));
    const id = text.slice(sep + 1);
    if (Number.isNaN(at.getTime()) || !ID_RE.test(id)) return null;
    return { at, id };
  } catch {
    return null;
  }
}
