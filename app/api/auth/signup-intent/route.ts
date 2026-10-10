import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { SIGNUP_INTENT_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/signup-intent — kayıt ekranında OAuth'a geçmeden önce seçilen hesap
 * türünü kısa ömürlü httpOnly çereze yazar. Eskiden "İşletme" seçip Google ile kayıt olan
 * kişi sessizce MÜŞTERİ hesabı alıyordu (rol bilgisi sunucuya hiç gitmiyordu).
 *
 * Çerez yalnız YENİ kullanıcı oluşturulurken okunur (`authAdapter.createUser`); mevcut
 * hesabın rolünü değiştiremez. `CUSTOMER` gönderilirse çerez silinir.
 */
const bodySchema = z.object({ role: z.enum(['CUSTOMER', 'DEALER']) });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const res = NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  const secure = request.nextUrl.protocol === 'https:';
  if (parsed.data.role === 'DEALER') {
    res.cookies.set(SIGNUP_INTENT_COOKIE, 'DEALER', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 15 * 60,
    });
  } else {
    res.cookies.set(SIGNUP_INTENT_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
  }
  return res;
}
