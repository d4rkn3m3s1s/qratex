/**
 * Eski (defineRoute'a taşınmamış) route'lar için JSON gövde + zod doğrulaması — `defineRoute`'un
 * 6. adımıyla AYNI sözleşme (mimari-api B6): JSON değilse 400 `BAD_REQUEST`, şemaya uymuyorsa
 * 400 `VALIDATION` + `details` (alan yolu + mesaj), çok büyükse 413.
 *
 *   const parsed = await parseJsonBody(request, BodySchema);
 *   if (!parsed.ok) return parsed.response;
 *   const { action } = parsed.data;
 *
 * Elle `typeof body.x === 'string'` kontrolleri yerine bunu kullanın: `null` gövde TypeError → 500
 * olmaz, sınırlar (uzunluk, enum) tek şemada durur ve istemci alan bazlı hata gösterebilir.
 */
import { NextResponse } from 'next/server';
import type { ZodTypeAny, z } from 'zod';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export type ParsedBody<S extends ZodTypeAny> = { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse };

const DEFAULT_MAX_BYTES = 1_000_000;

function fail(status: number, code: string, error: string, details?: unknown): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, success: false, error, message: error, code, ...(details !== undefined ? { details } : {}) },
      { status, headers: PRIVATE_NO_STORE_HEADERS }
    ),
  };
}

export async function parseJsonBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
  opts: { maxBytes?: number } = {}
): Promise<ParsedBody<S>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return fail(413, 'PAYLOAD_TOO_LARGE', 'Gönderilen veri çok büyük.');
  let raw: unknown = undefined;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > maxBytes) return fail(413, 'PAYLOAD_TOO_LARGE', 'Gönderilen veri çok büyük.');
    raw = text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    return fail(400, 'BAD_REQUEST', 'Gönderilen veri geçerli JSON değil.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 50).map((i) => ({ path: i.path.map(String).join('.'), message: i.message, code: i.code }));
    const first = parsed.error.issues[0]?.message;
    return fail(400, 'VALIDATION', first && !/^(Required|Expected|Invalid)/.test(first) ? first : 'Girilen bilgiler geçersiz. Lütfen kontrol edip tekrar deneyin.', details);
  }
  return { ok: true, data: parsed.data };
}
