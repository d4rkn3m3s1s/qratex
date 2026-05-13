import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendVerificationEmail } from '@/lib/email';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
});

/**
 * Test e-postası gönderir. Sadece development'ta veya ?secret= doğru olduğunda çalışır.
 * Örnek: POST /api/test-email?secret=... { "email": "test@example.com" }
 */
export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.TEST_EMAIL_SECRET;

  if (!isDev && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'JSON gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Geçersiz e-posta' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const to = parsed.data.email;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/auth/verify-email?token=test-token-link-calisimaz`;

  const result = await sendVerificationEmail(to, verifyUrl, 'Test Kullanıcı');

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'E-posta gönderilemedi.',
        hint: 'RESEND_API_KEY .env içinde mi? Sunucuyu yeniden başlattınız mı? Resend ücretsiz planda sadece kendi kayıtlı e-postanıza gönderebilirsiniz.',
      },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: `${to} adresine test e-postası gönderildi. Gelen kutusunu ve istenmeyen klasörünü kontrol edin.`,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
