import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { sanitizeContextLine, wrapUntrusted } from '@/lib/ai-prompt-safety';
import { TEAM_ROUTE_ROLES, requireTeamViewer, scopedTaskWhere } from '@/lib/team/access';
import { STATUS_META, isTaskStatus, priorityMeta } from '@/lib/team/constants';
import { dueDayOf, istanbulDayOf, isOverdue } from '@/lib/team/dates';
import { teamChat } from '@/lib/team/ai';

export const dynamic = 'force-dynamic';

const body = z.object({
  question: z.string().trim().min(3, 'Soru en az 3 karakter olmalı').max(500),
  /** Önceki soru-cevaplar (son 4 tur) — takip soruları için bağlam. */
  history: z
    .array(z.object({ q: z.string().max(500), a: z.string().max(2000) }))
    .max(4)
    .optional(),
});

/**
 * POST — ekip verisine doğal dille soru (tüm ekip). Bağlam GÖRÜNÜRLÜK KAPSAMIYLA sınırlı
 * (denetim Y4/O9: 300 rastgele görev + tüm üyeler LLM'e gidiyordu, hız sınırı yoktu); en son
 * güncellenen 200 açık görev, kod hesaplı gecikme bilgisiyle. Dakikalık AI sınırı.
 */
export const POST = defineRoute(
  { name: 'team.ai.ask', roles: TEAM_ROUTE_ROLES, schema: body, rateLimit: 'ai' },
  async ({ user, body: b }) => {
    const viewer = await requireTeamViewer(user.id);
    const now = new Date();
    const tasks = await prisma.companyTask.findMany({
      where: scopedTaskWhere(viewer, { archivedAt: null }),
      select: {
        title: true,
        status: true,
        priority: true,
        department: true,
        dueAt: true,
        estimateMin: true,
        spentMin: true,
        weekKey: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const lines = tasks.map((t) => {
      const who = sanitizeContextLine(t.assignedTo?.name ?? '') ?? 'atanmamış';
      const due = dueDayOf(t.dueAt) ?? 'yok';
      const late = t.status !== 'done' && isOverdue(t.dueAt, now) ? ' [GECİKMİŞ]' : '';
      const st = isTaskStatus(t.status) ? STATUS_META[t.status].label : t.status;
      const time = t.estimateMin != null || t.spentMin ? ` (tahmin ${t.estimateMin ?? '?'} dk / harcanan ${t.spentMin} dk)` : '';
      return `- [${st}] (${priorityMeta(t.priority).label}) ${sanitizeContextLine(t.title) ?? 'başlıksız'}${t.department ? ` #${t.department}` : ''} → ${who} | hafta ${t.weekKey ?? '-'} | bitiş ${due}${late}${time}`;
    });
    const history = (b.history ?? []).map((h) => `S: ${h.q}\nC: ${h.a}`).join('\n\n');
    const answer = await teamChat({
      actorId: viewer.userId,
      system:
        'Sen bir ekip yönetim asistanısın. YALNIZ verilen görev listesine dayanarak kısa ve net Türkçe cevap ver. Listede olmayan bilgiyi uydurma; bilmiyorsan "Bu veride yok" de. Liste isteniyorsa madde madde yaz.',
      user: `${history ? `Önceki konuşma:\n${wrapUntrusted('gecmis', history, 4000)}\n\n` : ''}Soru: ${wrapUntrusted('kullanici_mesaji', b.question, 600)}\n\nBugün (İstanbul): ${istanbulDayOf(now)}\n\nGörevler (${tasks.length}):\n${wrapUntrusted('veri', lines.join('\n') || 'yok', 16_000)}`,
      temperature: 0.2,
      maxTokens: 600,
    });
    return { answer, basedOn: tasks.length };
  }
);
