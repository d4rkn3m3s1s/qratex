import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { sanitizeContextLine, wrapUntrusted } from '@/lib/ai-prompt-safety';
import { TEAM_ROUTE_ROLES, requireTeamViewer, scopedTaskWhere } from '@/lib/team/access';
import { STATUS_META, isTaskStatus, priorityMeta } from '@/lib/team/constants';
import { isOverdue } from '@/lib/team/dates';
import { extractJson, teamChat } from '@/lib/team/ai';
import { isWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('suggest_checklist'), title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional() }),
  z.object({ op: z.literal('suggest_assignment'), title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional() }),
  z.object({ op: z.literal('weekly_summary'), weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional() }),
]);

/**
 * POST — yönetici AI yardımcıları (alt görev önerisi, atama önerisi, haftalık özet).
 * Yetki matrisiyle aynı: arayüz bu düğmeleri yalnız yöneticiye gösterir (denetim Y1: üye
 * "AI Özet"e basıp 403 alıyordu). Sayıları KOD hesaplar, LLM yalnız anlatır; dakikalık sınır.
 */
export const POST = defineRoute(
  { name: 'team.ai', roles: TEAM_ROUTE_ROLES, schema: body, rateLimit: 'ai' },
  async ({ user, body: d }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });

    if (d.op === 'suggest_checklist') {
      const content = await teamChat({
        actorId: viewer.userId,
        system:
          'Sen bir proje yöneticisi asistanısın. Verilen göreve uygun 3-6 somut alt görev üret. SADECE JSON döndür: {"items": ["adım 1", "adım 2"]}. Türkçe, kısa ve eylem odaklı.',
        user: wrapUntrusted('veri', `Görev başlığı: ${d.title}\n${d.description ? `Açıklama: ${d.description}` : ''}`),
        jsonMode: true,
        maxTokens: 400,
      });
      const json = extractJson(content) as { items?: unknown } | unknown[] | null;
      const raw = Array.isArray(json) ? json : Array.isArray((json as { items?: unknown })?.items) ? (json as { items: unknown[] }).items : [];
      const items = raw.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 8);
      return { items };
    }

    if (d.op === 'suggest_assignment') {
      const [departments, members] = await Promise.all([
        prisma.department.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
        prisma.user.findMany({
          where: { adminTeamRole: { not: null } },
          select: { id: true, name: true, teamDepartments: { select: { departmentSlug: true } } },
          take: 200,
        }),
      ]);
      const depList = departments.map((x) => `${x.slug} (${sanitizeContextLine(x.name) ?? x.slug})`).join(', ');
      const memList = members
        .map((m) => `${m.id}: ${sanitizeContextLine(m.name ?? '') ?? 'üye'}${m.teamDepartments.length ? ` [${m.teamDepartments.map((t) => t.departmentSlug).join(',')}]` : ''}`)
        .join('; ');
      const content = await teamChat({
        actorId: viewer.userId,
        system:
          'Sen bir ekip görev yönlendirme asistanısın. Göreve en uygun departmanı ve kişiyi seç. SADECE JSON döndür: {"department": "<slug veya null>", "assignedToId": "<id veya null>", "reason": "<kısa gerekçe>"}. Yalnız verilen listelerden seç.',
        user: `${wrapUntrusted('veri', `Görev: ${d.title}\n${d.description ?? ''}`)}\nDepartmanlar: ${depList || 'yok'}\nÜyeler: ${memList || 'yok'}`,
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 300,
      });
      const json = (extractJson(content) ?? {}) as { department?: string | null; assignedToId?: string | null; reason?: string };
      // Önerilen değerler gerçekten listede mi? (uydurma kimlik kabul edilmez)
      const department = json.department && departments.some((x) => x.slug === json.department) ? json.department : null;
      const assignedToId = json.assignedToId && members.some((m) => m.id === json.assignedToId) ? json.assignedToId : null;
      return { department, assignedToId, reason: typeof json.reason === 'string' ? json.reason.slice(0, 300) : null };
    }

    // Haftalık özet — sayıları kod hesaplar (arşiv hariç; denetim Bulgu 12), LLM anlatır.
    const weekKey = d.weekKey ?? weekKeyOf();
    const tasks = await prisma.companyTask.findMany({
      where: scopedTaskWhere(viewer, { weekKey, archivedAt: null }),
      select: { title: true, status: true, priority: true, dueAt: true, assignedTo: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    if (tasks.length === 0) return { summary: null, stats: { total: 0, done: 0, review: 0, overdue: 0 } };
    const now = new Date();
    const stats = {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      review: tasks.filter((t) => t.status === 'review').length,
      overdue: tasks.filter((t) => t.status !== 'done' && isOverdue(t.dueAt, now)).length,
    };
    const lines = tasks
      .map((t) => {
        const title = sanitizeContextLine(t.title) ?? 'başlıksız';
        const st = isTaskStatus(t.status) ? STATUS_META[t.status].label : t.status;
        const late = t.status !== 'done' && isOverdue(t.dueAt, now) ? ' [gecikmiş]' : '';
        return `- [${st}] (${priorityMeta(t.priority).label}) ${title}${t.assignedTo?.name ? ` → ${sanitizeContextLine(t.assignedTo.name) ?? ''}` : ''}${late}`;
      })
      .join('\n');
    const summary = await teamChat({
      actorId: viewer.userId,
      system:
        'Sen bir ekip yöneticisi asistanısın. Verilen haftalık görev listesinden yöneticiye 3-5 cümlelik Türkçe bir özet yaz: genel ilerleme, dikkat gereken yüksek öncelikli/geciken işler, kişi dağılımı. Verilen sayıları DEĞİŞTİRME, uydurma bilgi ekleme. Akıcı paragraf yaz.',
      user: `Hafta: ${weekKey}\nToplam: ${stats.total}, Biten: ${stats.done}, Onayda: ${stats.review}, Geciken: ${stats.overdue}\n\n${wrapUntrusted('veri', lines, 12_000)}`,
      temperature: 0.4,
      maxTokens: 500,
    });
    return { summary, stats, weekKey };
  }
);
