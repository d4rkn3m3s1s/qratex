import { NextRequest, NextResponse } from 'next/server';
import { sendVerificationEmail } from '@/lib/email';

/**
 * Test e-postası gönderir. Sadece development'ta veya ?secret= doğru olduğunda çalışır.
 * Örnek: POST /api/test-email { "email": "test@example.com" }
 */
export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.TEST_EMAIL_SECRET;
  if (!isDev && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON gerekli' }, { status: 400 });
  }

  const to = body.email?.trim();
  if (!to) {
    return NextResponse.json({ error: 'email gerekli' }, { status: 400 });
  }

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
      { status: 200 }
    );
  }

  return NextResponse.json({ success: true, message: `${to} adresine test e-postası gönderildi. Gelen kutusunu ve istenmeyen klasörünü kontrol edin.` });
}
