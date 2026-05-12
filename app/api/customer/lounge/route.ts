import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

/**
 * Müşteri: VIP katmanı + doğum günü bilgisi (sessil lüks / lounge).
 */
export async function GET() {
  const gate = await assertModuleEnabled('vip_lounge');
  if (gate) return gate;
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      points: true,
      level: true,
      vipStatus: {
        select: {
          totalSpent: true,
          lifetimePoints: true,
          tierExpiry: true,
          tier: { select: { id: true, name: true, minPoints: true, order: true } },
        },
      },
      birthday: {
        select: { birthDate: true, bonusGiven: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
  }

  const birth = user.birthday?.birthDate ?? null;
  let daysUntilBirthday: number | null = null;
  if (birth) {
    const now = new Date();
    const next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    if (next < now) next.setFullYear(next.getFullYear() + 1);
    daysUntilBirthday = Math.ceil((next.getTime() - now.getTime()) / (86400 * 1000));
  }

  const perks: string[] = [
    'Öncelikli kampanya bildirimleri',
    'Doğum günü bonusu (profilde tarih tanımlıysa)',
    'Lounge içi mini görev önerileri',
  ];
  if (user.vipStatus && user.vipStatus.tier.order >= 2) {
    perks.push('Sadakat katmanına göre ek puan çarpanı (kampanya dönemlerinde)');
    perks.push('Bağış eşleştirmelerinde öncelikli rozet');
  }

  return NextResponse.json({
    success: true,
    lounge: {
      vip: user.vipStatus
        ? {
            tierName: user.vipStatus.tier.name,
            minPoints: user.vipStatus.tier.minPoints,
            order: user.vipStatus.tier.order,
            totalSpent: user.vipStatus.totalSpent,
            lifetimePoints: user.vipStatus.lifetimePoints,
            tierExpiry: user.vipStatus.tierExpiry?.toISOString() ?? null,
          }
        : null,
      birthday: birth
        ? {
            birthDate: birth.toISOString().slice(0, 10),
            bonusGiven: user.birthday?.bonusGiven ?? false,
            daysUntilBirthday,
          }
        : null,
      points: user.points,
      level: user.level,
      perks,
    },
  });
}
