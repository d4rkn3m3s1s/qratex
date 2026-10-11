import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { sendVerificationEmail } from '@/lib/email';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { parseJsonBody } from '@/lib/http/parse-body';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getClientIp } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').max(320),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Test e-postası (geliştirici aracı). Geliştirmede serbest; diğer ortamlarda YALNIZ
 * `Authorization: Bearer <TEST_EMAIL_SECRET>` ile ve sır tanımlıysa çalışır.
 *
 * mimari-api (güvenlik taraması): eskiden sır `?secret=` sorgu parametresindeydi (erişim
 * günlüklerine/yönlendiren başlığına düşer), sabit zamanlı karşılaştırılmıyordu, oran sınırı
 * yoktu ve gönderim hatası `200` dönüyordu. Sır tanımsızsa uç yok sayılır (404).
 *
 *   curl -X POST /api/test-email -H "Authorization: Bearer $TEST_EMAIL_SECRET" -d '{"email":"..."}'
 */
export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    const expected = process.env.TEST_EMAIL_SECRET?.trim();
    if (!expected) return json({ success: false, code: 'NOT_FOUND', error: 'Bulunamadı.' }, 404);
    const header = request.headers.get('authorization') ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!provided || !secretMatches(provided, expected)) {
      return json({ success: false, code: 'FORBIDDEN', error: 'Bu işlem için yetkiniz yok.' }, 403);
    }
  }

  const limited = await enforceRouteRateLimit('test-email', getClientIp(request) ?? 'unknown', 'sensitive');
  if (limited) return limited;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 2_048 });
  if (!parsed.ok) return parsed.response;
  const to = parsed.data.email;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/auth/verify-email?token=test-token-link-calisimaz`;

  const result = await sendVerificationEmail(to, verifyUrl, 'Test Kullanıcı');
  if (!result.ok) {
    return json(
      {
        success: false,
        code: 'EMAIL_SEND_FAILED',
        error: result.error || 'E-posta gönderilemedi.',
        hint: 'RESEND_API_KEY .env içinde mi? Sunucuyu yeniden başlattınız mı? Resend ücretsiz planda sadece kendi kayıtlı e-postanıza gönderebilirsiniz.',
      },
      502
    );
  }

  return json(
    {
      success: true,
      message: `${to} adresine test e-postası gönderildi. Gelen kutusunu ve istenmeyen klasörünü kontrol edin.`,
    },
    200
  );
}
