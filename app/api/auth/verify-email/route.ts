import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';
import { verifyEmailWithToken } from '@/lib/auth-email-token';

export const dynamic = 'force-dynamic';

/**
 * E-posta doğrulama (P0-39 kayıt akışı).
 *
 * Yanıt sözleşmesi — metin değil DURUM döner, sayfa durumu TR/EN çizer:
 *   200 { success: true,  status: 'verified' | 'already_verified' }
 *   400 { success: false, status: 'expired', maskedEmail }   → tek tıkla yeniden gönder
 *   400 { success: false, status: 'invalid' }
 *   429 { success: false, status: 'rate_limited' }
 *
 * İdempotent: aynı bağlantıya ikinci tıklama `already_verified` döner (eskiden token
 * silindiği için doğrulanmış kullanıcı "geçersiz bağlantı" görüyordu).
 *
 * Doğrulama sonrası ekonomik adım (bekleyen davet ödülü) bu uçta hesaplanmaz: puan
 * şeridinin `qualifyReferral` servisi yanıttan sonra çağrılır (atomik + tek seferlik orada).
 */
const bodySchema = z.object({ token: z.string().trim().min(16).max(512) });

async function handle(request: NextRequest, rawToken: unknown) {
  const ip = getClientIdentifier(request);
  const rl = await checkRateLimitDb(`verify_email:${ip}`, 30, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, status: 'rate_limited' },
      {
        status: 429,
        headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
      }
    );
  }

  const parsed = bodySchema.safeParse({ token: rawToken });
  if (!parsed.success) {
    return NextResponse.json({ success: false, status: 'invalid' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const outcome = await verifyEmailWithToken(parsed.data.token);
    if (outcome.status === 'verified') {
      // Bekleyen davet: koşullar (doğrulanmış e-posta + ilk QR olayı) zaten sağlanıyorsa
      // tek seferlik ve atomik ödeme `qualifyReferral` (lib/referral, puan şeridi) içinde.
      // Yanıttan sonra çalışır; hata doğrulamayı bozmaz.
      const userId = outcome.userId;
      after(async () => {
        try {
          const { qualifyReferral } = await import('@/lib/referral');
          await qualifyReferral(userId);
        } catch (e) {
          console.error('[verify-email] qualifyReferral failed', e);
        }
      });
    }
    if (outcome.status === 'verified' || outcome.status === 'already_verified') {
      return NextResponse.json({ success: true, status: outcome.status }, { headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json(
      { success: false, ...outcome },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/auth/verify-email', status: 500 });
    return NextResponse.json({ success: false, status: 'error' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  return handle(request, body?.token);
}

/** Geriye uyumluluk: dağıtım geçişinde eski istemci GET ile çağırabilir. */
export async function GET(request: NextRequest) {
  return handle(request, request.nextUrl.searchParams.get('token'));
}
