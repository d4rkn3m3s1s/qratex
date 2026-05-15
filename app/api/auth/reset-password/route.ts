import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { consumePasswordResetToken } from '@/lib/auth-email-token';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().min(16).max(512),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
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
