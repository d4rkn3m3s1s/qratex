import { NextRequest, NextResponse } from 'next/server';
import { getOptionalSession } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';
import { acceptStaffInvitation, previewStaffInvitation } from '@/lib/staff-invitations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Davetli tarafı (oturum opsiyonel — hesabı olmayan davetli de kullanır):
 *  GET  ?token=  → davet önizlemesi (işletme adı, maskeli e-posta, hesap var mı).
 *  POST { token, name?, password? } → daveti kabul et.
 *
 * Güvenlik: token yalnız davet e-postasına gider (bayiye verilmez); kabul eden hesap davet
 * e-postasıyla EŞLEŞMEK zorunda; ADMIN/DEALER dönüştürülemez; IP başına rate limit.
 */

const acceptSchema = z.object({
  token: z.string().min(16).max(200),
  name: z.string().max(50).optional(),
  password: z.string().max(200).optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

async function limited(request: NextRequest, bucket: string, max: number) {
  const rl = await checkRateLimitDb(`${bucket}:${getClientIdentifier(request)}`, max, 60_000);
  return rl.ok ? null : json({ success: false, error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' }, 429);
}

export async function GET(request: NextRequest) {
  try {
    const tooMany = await limited(request, 'staff-invite-preview', 30);
    if (tooMany) return tooMany;
    const token = request.nextUrl.searchParams.get('token');
    const session = await getOptionalSession();
    const preview = await previewStaffInvitation(token, {
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
    });
    if (!preview.ok) return json({ success: false, error: preview.error, code: preview.code }, preview.status);
    return json({ success: true, invitation: preview });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Staff invitation preview:', error);
    return json({ success: false, error: 'Davet bilgisi alınamadı' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tooMany = await limited(request, 'staff-invite-accept', 10);
    if (tooMany) return tooMany;
    const body: unknown = await request.json().catch(() => null);
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) return json({ success: false, error: 'Geçersiz istek' }, 400);

    const session = await getOptionalSession();
    const result = await acceptStaffInvitation({
      plainToken: parsed.data.token,
      sessionUserId: session?.user?.id ?? null,
      name: parsed.data.name,
      password: parsed.data.password,
    });
    if (!result.ok) return json({ success: false, error: result.error, code: result.code }, result.status);

    return json({
      success: true,
      createdAccount: result.createdAccount,
      requiresReLogin: result.requiresReLogin,
      message: result.createdAccount
        ? 'Hesabınız oluşturuldu. Personel paneline erişmek için giriş yapın.'
        : 'Davet kabul edildi. Personel hesabınızla devam etmek için yeniden giriş yapın.',
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Staff invitation accept:', error);
    return json({ success: false, error: 'Davet kabul edilemedi' }, 500);
  }
}
