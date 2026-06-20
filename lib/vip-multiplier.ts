/**
 * VIP çarpanı çözümleyici — kullanıcının aktif VIP seviyesinin puan çarpanını döndürür.
 *
 * VIPTier.multiplier şemada vardı ama hiçbir yerde uygulanmıyordu (ölü alan).
 * Bu helper, müşterinin KAZANDIĞI aktivite puanlarına (feedback ödülü gibi)
 * seviye çarpanını uygular. Admin hibesi / sistem ödülleri çağırmaz — yalnızca
 * organik kazanım yollarında kullanılır, böylece çarpan istismar edilemez.
 *
 * Çarpan yoksa veya seviye atanmamışsa 1.0 döner (no-op).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Kullanıcının mevcut VIP puan çarpanını döndürür (>= 1.0).
 * Seviye yoksa, süresi dolmuşsa veya çarpan tanımsızsa 1.0.
 */
export async function getVipMultiplier(userId: string, db: Db = prisma): Promise<number> {
  try {
    const status = await db.userVIPStatus.findUnique({
      where: { userId },
      select: {
        tierExpiry: true,
        tier: { select: { multiplier: true, isActive: true } },
      },
    });
    if (!status?.tier || !status.tier.isActive) return 1.0;
    // Süreli seviye dolmuşsa çarpan uygulanmaz.
    if (status.tierExpiry && status.tierExpiry.getTime() < Date.now()) return 1.0;
    const m = status.tier.multiplier;
    return typeof m === 'number' && m > 1 ? m : 1.0;
  } catch {
    // VIP tabloları yoksa / hata → çarpan uygulama (güvenli no-op).
    return 1.0;
  }
}

/**
 * Bir taban puanı VIP çarpanıyla çarpıp tam sayıya yuvarlar.
 * Çarpan ve sonuç döner ki çağıran event'e kaydedebilsin.
 */
export async function applyVipMultiplier(
  userId: string,
  basePoints: number,
  db: Db = prisma
): Promise<{ points: number; multiplier: number; bonus: number }> {
  if (basePoints <= 0) return { points: basePoints, multiplier: 1.0, bonus: 0 };
  const multiplier = await getVipMultiplier(userId, db);
  if (multiplier <= 1.0) return { points: basePoints, multiplier: 1.0, bonus: 0 };
  const boosted = Math.floor(basePoints * multiplier);
  return { points: boosted, multiplier, bonus: boosted - basePoints };
}
