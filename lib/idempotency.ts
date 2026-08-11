/**
 * Idempotency key: kritik POST'larda tekrar isteği çift işlem yaratmasın.
 * Header: Idempotency-Key: <uuid>
 * TTL: 24 saat
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

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
      response: NextResponse.json(JSON.parse(existing.responseBody), {
        status: existing.statusCode as 200 | 201,
        headers: PRIVATE_NO_STORE_HEADERS,
      }),
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
 * Wrapper: RESERVE-FIRST idempotency. Handler çalışmadan ÖNCE key'i atomik `create` ile rezerve
 * eder (statusCode=0 = "in-progress"). İki paralel istek aynı key ile gelirse ikincinin create'i
 * unique-violation (P2002) ile çakışır → 409 döner (çift işlem ENGELLENİR). Önceki desen
 * (findUnique → işle → upsert) TOCTOU açığıyla ikisini de çalıştırıyordu.
 */
export async function withIdempotency<T>(
  request: Request,
  route: string,
  handler: () => Promise<{ statusCode: number; body: T }>
): Promise<NextResponse> {
  const key = getKeyFromHeader(request.headers);
  // Key yoksa idempotency yok — normal çalıştır.
  if (!key) {
    const result = await handler();
    return NextResponse.json(result.body, { status: result.statusCode, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const now = new Date();
  // Tamamlanmış (cached) bir yanıt var mı?
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing && existing.route === route && existing.expiresAt > now) {
    if (existing.statusCode === 0) {
      // Aynı key hâlâ İŞLENİYOR (başka istek rezerve etmiş, henüz bitmemiş) → 409.
      return NextResponse.json(
        { error: 'Bu istek zaten işleniyor (idempotency).', code: 'IN_PROGRESS' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(JSON.parse(existing.responseBody), {
      status: existing.statusCode as 200 | 201,
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  }

  // REZERVE ET (atomik). Çakışırsa (P2002) = paralel ikinci istek → 409.
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);
  try {
    if (existing) {
      // Süresi geçmiş eski kayıt var → in-progress'e resetle (sadece süresi geçmişse).
      await prisma.idempotencyKey.updateMany({
        where: { key, expiresAt: { lte: now } },
        data: { route, statusCode: 0, responseBody: '', expiresAt },
      });
    } else {
      await prisma.idempotencyKey.create({ data: { key, route, statusCode: 0, responseBody: '', expiresAt } });
    }
  } catch {
    // create P2002 = başka istek aynı anda rezerve etti → çift işlemi engelle.
    return NextResponse.json(
      { error: 'Bu istek zaten işleniyor (idempotency).', code: 'IN_PROGRESS' },
      { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // İşle + gerçek sonucu yaz.
  const result = await handler();
  await storeIdempotency(key, route, result.statusCode, result.body);
  return NextResponse.json(result.body, { status: result.statusCode, headers: PRIVATE_NO_STORE_HEADERS });
}
