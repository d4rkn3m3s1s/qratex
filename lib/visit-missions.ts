/**
 * Konum/ziyaret bazlı görevler — müşteri bir işletmede tüketim yapınca eşleşen
 * "visit_category" görevlerinin ilerlemesini OTOMATİK artırır; hedefe ulaşınca
 * XP/puan ödülü verir.
 *
 * Mevcut Quest/UserQuest framework'ünü kullanır (requirement JSON:
 * { type: 'visit_category', category?: string, count: number }). category boşsa
 * "herhangi N farklı işletme"; doluysa "o kategoride N farklı işletme".
 *
 * İlerleme = o görev için ziyaret edilen BENZERSİZ işletme sayısı (Consumption'dan
 * türetilir; aynı işletmeye tekrar gitmek sayacı artırmaz).
 */
import { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';

interface VisitRequirement {
  type: 'visit_category';
  category?: string;
  count: number;
}

function parseVisitRequirement(raw: unknown): VisitRequirement | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== 'visit_category') return null;
  const count = typeof o.count === 'number' ? Math.max(1, Math.floor(o.count)) : null;
  if (!count) return null;
  return { type: 'visit_category', category: typeof o.category === 'string' ? o.category : undefined, count };
}

function parseReward(raw: unknown): { points: number; xp: number } {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      points: typeof o.points === 'number' ? Math.max(0, Math.floor(o.points)) : 0,
      xp: typeof o.xp === 'number' ? Math.max(0, Math.floor(o.xp)) : 0,
    };
  }
  return { points: 0, xp: 0 };
}

/**
 * Bir müşterinin bir işletmeyi ziyaret etmesinden sonra çağrılır. Aktif
 * visit_category görevlerini değerlendirir; ilerlemeyi günceller; tamamlananlara
 * ödül verir + bildirim atar. Döner: tamamlanan görev sayısı.
 */
export async function advanceVisitMissions(userId: string, dealerId: string): Promise<{ completed: number }> {
  // Ziyaret edilen işletmenin kategorisi (kategori-eşlemeli görevler için).
  const dealer = await prisma.user.findUnique({ where: { id: dealerId }, select: { businessCategory: true } });
  const dealerCategory = dealer?.businessCategory ?? null;

  // Aktif visit_category görevleri.
  const quests = await prisma.quest.findMany({
    where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true, name: true, requirement: true, reward: true },
  });
  const visitQuests = quests
    .map((q) => ({ quest: q, req: parseVisitRequirement(q.requirement) }))
    .filter((x): x is { quest: (typeof quests)[number]; req: VisitRequirement } => x.req !== null);
  if (visitQuests.length === 0) return { completed: 0 };

  let completed = 0;

  for (const { quest, req } of visitQuests) {
    // Kategori filtresi: görev belirli kategori istiyorsa ve bu ziyaret eşleşmiyorsa atla.
    if (req.category && req.category !== dealerCategory) continue;

    // Bu görev için müşterinin ziyaret ettiği BENZERSİZ işletme sayısı.
    const distinctDealers = await prisma.consumption.findMany({
      where: {
        customerId: userId,
        ...(req.category ? { dealer: { businessCategory: req.category } } : {}),
      },
      select: { dealerId: true },
      distinct: ['dealerId'],
    });
    const progress = Math.min(distinctDealers.length, req.count);

    // UserQuest kaydını upsert et; zaten tamamlandıysa dokunma.
    const existing = await prisma.userQuest.findUnique({
      where: { userId_questId: { userId, questId: quest.id } },
      select: { id: true, completedAt: true },
    });
    if (existing?.completedAt) continue;

    const isComplete = progress >= req.count;

    if (!isComplete) {
      // Henüz tamamlanmadı: sadece ilerlemeyi yaz (ödül yok, yarış riski yok).
      await prisma.userQuest.upsert({
        where: { userId_questId: { userId, questId: quest.id } },
        update: { progress },
        create: { userId, questId: quest.id, progress },
      });
      continue;
    }

    const reward = parseReward(quest.reward);

    // ATOMİK tamamlama: ödülü yalnızca completedAt'i null'dan now'a İLK çeviren
    // çağrı verir. Önceden findUnique-then-upsert idi → iki eşzamanlı ziyaret
    // ikisi de completedAt=null görüp ödülü ÇİFT kredilendiriyordu (rank 12).
    const claimed = await prisma.$transaction(async (tx) => {
      // Kayıt yoksa önce oluştur (henüz tamamlanmamış olarak), sonra guard'la claim et.
      await tx.userQuest.upsert({
        where: { userId_questId: { userId, questId: quest.id } },
        update: { progress },
        create: { userId, questId: quest.id, progress },
      });
      const claim = await tx.userQuest.updateMany({
        where: { userId, questId: quest.id, completedAt: null },
        data: { completedAt: new Date(), progress },
      });
      if (claim.count === 0) return false;

      if (reward.points > 0 || reward.xp > 0) {
        await creditPointsAndXp(tx, { userId, points: reward.points, xp: reward.xp });
        if (reward.points > 0) {
          await tx.analyticsEvent.create({
            data: {
              userId,
              event: 'points_credited',
              category: 'quest',
              data: { points: reward.points, questId: quest.id },
            },
          });
        }
      }
      return true;
    });

    if (claimed) {
      await prisma.notification.create({
        data: {
          userId,
          title: '🎯 Görev tamamlandı!',
          message: `"${quest.name}" görevini tamamladın${reward.points > 0 ? ` ve ${reward.points} puan kazandın` : ''}!`,
          type: 'success',
          data: { questId: quest.id, points: reward.points, xp: reward.xp },
        },
      });
      completed++;
    }
  }

  return { completed };
}
