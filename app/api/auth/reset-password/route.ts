import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { consumePasswordResetToken } from '@/lib/auth-email-token';
import { checkAuthEmailActionLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().min(16).max(512),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  // Rate limit — token tahmin/deneme ve DB yükünü sınırla (diğer auth-email
  // aksiyonlarıyla tutarlı, IP başına 15 dk penceresi).
  const ip = getClientIdentifier(request);
  const rl = await checkAuthEmailActionLimit('reset_password', ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Geçersiz veri' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
  const result = await consumePasswordResetToken(parsed.data.token, hashed);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json({ success: true, message: 'Şifreniz güncellendi. Giriş yapabilirsiniz.' }, { headers: PRIVATE_NO_STORE_HEADERS });
}
