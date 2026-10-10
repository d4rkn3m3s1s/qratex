import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { buildVip } from '@/lib/wallet-card/dto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vip — kullanıcının VIP durumu (SALT OKUNUR).
 *
 * Lounge raporu B1 + doğrulama "ek risk": bu GET eskiden harcanabilir bakiyeye bakıp
 * `UserVIPStatus` upsert ediyor ve bildirim yazıyordu (yan etkili GET). Uygulamada çağıran
 * yoktu; elle çağıran kullanıcı geçici yüksek bakiyeyle Platinum'a (×2 geri bildirim çarpanı)
 * yükselip puanı harcayabiliyor, katman bir daha düşmüyordu. Atama, olay güdümlü statü
 * işinde (F4.4, ekonomi şeridi) yapılacak; burada yalnız mevcut kayıt okunur.
 */
export const GET = defineRoute({ name: 'vip.get', roles: ['CUSTOMER'], rateLimit: 'read' }, async ({ user }) => {
  const now = new Date();
  const status = await prisma.userVIPStatus.findUnique({
    where: { userId: user.id },
    select: {
      tierExpiry: true,
      upgradedAt: true,
      tier: { select: { name: true, color: true, icon: true, multiplier: true, isActive: true } },
    },
  });
  return { vip: buildVip(status, now), upgradedAt: status?.upgradedAt?.toISOString() ?? null };
});
