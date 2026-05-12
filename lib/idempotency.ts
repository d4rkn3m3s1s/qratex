/**
 * Idempotency key: kritik POST'larda tekrar isteği çift işlem yaratmasın.
 * Header: Idempotency-Key: <uuid>
 * TTL: 24 saat
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const TTL_HOURS = 24;

function getKeyFromHeader(headers: Headers): string | null {
  const key = headers.get('idempotency-key') || headers.get('Idempotency-Key');
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.length < 16 || trimmed.length > 128) return null;
  return trimmed;
}

export type IdempotencyResult =
  | { cached: true; response: NextResponse }
  | { cached: false; key: string };

/**
 * Check idempotency: aynı key varsa cached response döndür.
 * Yoksa { cached: false, key } döndür; route işledikten sonra storeIdempotency çağır.
 */
export async function checkIdempotency(
  request: Request,
  route: string
): Promise<IdempotencyResult | { error: NextResponse }> {
  const key = getKeyFromHeader(request.headers);
  if (!key) return { cached: false, key: '' };

  const now = new Date();
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key },
  });

  if (existing && existing.route === route && existing.expiresAt > now) {
    return {
      cached: true,
      response: NextResponse.json(
        JSON.parse(existing.responseBody),
        { status: existing.statusCode as 200 | 201 }
      ),
    };
  }

  return { cached: false, key };
}

/**
 * Store idempotency result after successful processing.
 */
export async function storeIdempotency(
  key: string,
  route: string,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  if (!key) return;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);

  await prisma.idempotencyKey.upsert({
    where: { key },
    create: {
      key,
      route,
      statusCode,
      responseBody: JSON.stringify(responseBody),
      expiresAt,
    },
    update: {
      statusCode,
      responseBody: JSON.stringify(responseBody),
      expiresAt,
    },
  });
}

/**
 * Wrapper: check idempotency first; if not cached, run handler and store result.
 */
export async function withIdempotency<T>(
  request: Request,
  route: string,
  handler: () => Promise<{ statusCode: number; body: T }>
): Promise<NextResponse> {
  const check = await checkIdempotency(request, route);
  if ('error' in check) return check.error;
  if (check.cached) return check.response;
  if (!check.key) {
    const result = await handler();
    return NextResponse.json(result.body, { status: result.statusCode });
  }
  const result = await handler();
  await storeIdempotency(check.key, route, result.statusCode, result.body);
  return NextResponse.json(result.body, { status: result.statusCode });
}
