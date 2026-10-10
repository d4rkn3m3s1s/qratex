import { prisma } from '@/lib/prisma';
import { weekKeyOf } from '@/lib/team-week';

/**
 * İşletme verisinden ekip görevi üretimi.
 * Açık Incident (yüksek/kritik) ve bekleyen yüksek öncelikli ActionItem kayıtlarını
 * CompanyTask'a dönüştürür. İdempotent: (sourceType, sourceRef) için ikinci görev üretilmez.
 * Denetim Bulgu 11: kaynak başına ayrı `findFirst` (N+1) yerine tek sorguda mevcutlar okunur.
 *
 * Departman eşlemesi: olay → satış/pazarlama, aksiyon maddesi → üretim/geliştirme; departman
 * yoksa ya da arşivliyse görev departmansız (genel) kalır.
 */

const DEP_SALES = 'satis-sponsorluk-ve-pazarlama';
const DEP_DEV = 'uretim-ve-gelistirme';

function sevToPriority(sev: string): 'low' | 'medium' | 'high' {
  if (sev === 'critical' || sev === 'high') return 'high';
  if (sev === 'low') return 'low';
  return 'medium';
}

async function loadCandidates() {
  const [incidents, actionItems] = await Promise.all([
    prisma.incident.findMany({
      where: { status: { in: ['open', 'assigned'] }, severity: { in: ['high', 'critical'] } },
      select: { id: true, title: true, description: true, severity: true, dueAt: true, dealer: { select: { name: true } } },
      take: 100,
    }),
    prisma.actionItem.findMany({
      where: { status: { in: ['pending', 'assigned'] }, priority: 'high' },
      select: { id: true, suggestionText: true, dueAt: true, dealer: { select: { name: true } } },
      take: 100,
    }),
  ]);
  const existing = await prisma.companyTask.findMany({
    where: {
      OR: [
        { sourceType: 'incident', sourceRef: { in: incidents.map((i) => i.id) } },
        { sourceType: 'action-item', sourceRef: { in: actionItems.map((a) => a.id) } },
      ],
    },
    select: { sourceType: true, sourceRef: true },
  });
  const done = new Set(existing.map((e) => `${e.sourceType}:${e.sourceRef}`));
  return {
    incidents: incidents.filter((i) => !done.has(`incident:${i.id}`)),
    actionItems: actionItems.filter((a) => !done.has(`action-item:${a.id}`)),
  };
}

/** Önizleme: kaç YENİ görev üretilecek (zaten üretilmiş kaynaklar sayılmaz). */
export async function previewBusinessTasks(): Promise<{ incidents: number; actionItems: number }> {
  const c = await loadCandidates();
  return { incidents: c.incidents.length, actionItems: c.actionItems.length };
}

/**
 * @param createdById Görevleri oluşturan yönetici.
 * @param weekKey Görevlerin yazılacağı hafta (varsayılan: içinde bulunulan hafta).
 */
export async function generateTasksFromBusinessData(
  createdById: string,
  weekKey: string = weekKeyOf()
): Promise<{ fromIncidents: number; fromActionItems: number; total: number; created: Array<{ id: string; title: string; department: string | null; tags: string | null }> }> {
  const { incidents, actionItems } = await loadCandidates();
  const deps = await prisma.department.findMany({ where: { slug: { in: [DEP_SALES, DEP_DEV] }, isActive: true }, select: { slug: true } });
  const has = new Set(deps.map((d) => d.slug));
  const created: Array<{ id: string; title: string; department: string | null; tags: string | null }> = [];

  for (const inc of incidents) {
    const t = await prisma.companyTask.create({
      data: {
        title: `Olay: ${inc.title}`.slice(0, 200),
        description: [inc.description, inc.dealer?.name ? `İşletme: ${inc.dealer.name}` : null].filter(Boolean).join('\n\n') || null,
        priority: sevToPriority(inc.severity),
        department: has.has(DEP_SALES) ? DEP_SALES : null,
        weekKey,
        dueAt: inc.dueAt,
        createdById,
        sourceType: 'incident',
        sourceRef: inc.id,
        tags: 'otomatik,olay',
        activities: { create: { actorId: createdById, action: 'created', detail: 'İşletme olayından otomatik üretildi' } },
      },
      select: { id: true, title: true, department: true, tags: true },
    });
    created.push(t);
  }
  for (const ai of actionItems) {
    const short = ai.suggestionText.length > 120 ? `${ai.suggestionText.slice(0, 120)}…` : ai.suggestionText;
    const t = await prisma.companyTask.create({
      data: {
        title: `Aksiyon: ${short}`.slice(0, 200),
        description: [ai.suggestionText, ai.dealer?.name ? `İşletme: ${ai.dealer.name}` : null].filter(Boolean).join('\n\n'),
        priority: 'high',
        department: has.has(DEP_DEV) ? DEP_DEV : null,
        weekKey,
        dueAt: ai.dueAt,
        createdById,
        sourceType: 'action-item',
        sourceRef: ai.id,
        tags: 'otomatik,aksiyon',
        activities: { create: { actorId: createdById, action: 'created', detail: 'Aksiyon maddesinden otomatik üretildi' } },
      },
      select: { id: true, title: true, department: true, tags: true },
    });
    created.push(t);
  }

  return { fromIncidents: incidents.length, fromActionItems: actionItems.length, total: created.length, created };
}
