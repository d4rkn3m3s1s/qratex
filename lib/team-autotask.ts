import { prisma } from '@/lib/prisma';
import { weekKeyOf } from '@/lib/team-week';

/**
 * İşletme verisinden ekip görevi üretimi.
 * Açık Incident (yüksek/kritik) ve bekleyen yüksek-öncelikli ActionItem kayıtlarını
 * CompanyTask'a dönüştürür. İdempotent: (sourceType, sourceRef) benzersiz kabul edilir —
 * aynı kaynak için ikinci kez görev üretilmez.
 *
 * Departman eşlemesi: incident/churn → satış-pazarlama, action-item → üretim-geliştirme
 * (varsayılan slug'lar; yoksa null/genel kalır).
 */

const DEP_SALES = 'satis-sponsorluk-ve-pazarlama';
const DEP_DEV = 'uretim-ve-gelistirme';

function sevToPriority(sev: string): 'low' | 'medium' | 'high' {
  if (sev === 'critical' || sev === 'high') return 'high';
  if (sev === 'low') return 'low';
  return 'medium';
}

/** Bir kaynak için görev zaten üretilmiş mi? */
async function alreadyGenerated(sourceType: string, sourceRef: string): Promise<boolean> {
  const existing = await prisma.companyTask.findFirst({
    where: { sourceType, sourceRef }, select: { id: true },
  });
  return !!existing;
}

/**
 * @param createdById Görevleri oluşturan admin kullanıcı id'si.
 * @returns Üretilen görev sayıları (kaynağa göre).
 */
export async function generateTasksFromBusinessData(createdById: string): Promise<{
  fromIncidents: number; fromActionItems: number; total: number;
}> {
  const weekKey = weekKeyOf();
  let fromIncidents = 0;
  let fromActionItems = 0;

  // ── Açık, yüksek/kritik incident'lar ─────────────────────────────
  const incidents = await prisma.incident.findMany({
    where: { status: { in: ['open', 'assigned'] }, severity: { in: ['high', 'critical'] } },
    select: { id: true, title: true, description: true, severity: true, dealerId: true, dueAt: true, dealer: { select: { name: true } } },
    take: 100,
  });
  for (const inc of incidents) {
    if (await alreadyGenerated('incident', inc.id)) continue;
    await prisma.companyTask.create({
      data: {
        title: `🚨 ${inc.title}`,
        description: [inc.description, inc.dealer?.name ? `İşletme: ${inc.dealer.name}` : null].filter(Boolean).join('\n\n') || null,
        priority: sevToPriority(inc.severity),
        department: DEP_SALES,
        weekKey,
        dueAt: inc.dueAt,
        createdById,
        sourceType: 'incident',
        sourceRef: inc.id,
        tags: 'otomatik,incident',
      },
    });
    fromIncidents++;
  }

  // ── Bekleyen, yüksek öncelikli action item'lar ───────────────────
  const actionItems = await prisma.actionItem.findMany({
    where: { status: { in: ['pending', 'assigned'] }, priority: 'high' },
    select: { id: true, suggestionText: true, priority: true, dueAt: true, dealer: { select: { name: true } } },
    take: 100,
  });
  for (const ai of actionItems) {
    if (await alreadyGenerated('action-item', ai.id)) continue;
    const short = ai.suggestionText.length > 120 ? `${ai.suggestionText.slice(0, 120)}…` : ai.suggestionText;
    await prisma.companyTask.create({
      data: {
        title: `✅ ${short}`,
        description: [ai.suggestionText, ai.dealer?.name ? `İşletme: ${ai.dealer.name}` : null].filter(Boolean).join('\n\n'),
        priority: 'high',
        department: DEP_DEV,
        weekKey,
        dueAt: ai.dueAt,
        createdById,
        sourceType: 'action-item',
        sourceRef: ai.id,
        tags: 'otomatik,aksiyon',
      },
    });
    fromActionItems++;
  }

  return { fromIncidents, fromActionItems, total: fromIncidents + fromActionItems };
}
