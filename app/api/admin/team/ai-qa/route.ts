import { NextRequest, NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { runChatCompletion, isAIConfigured } from '@/lib/ai-engine';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// AI Q&A — doğal dil ile ekip verisi sorgulama (Notion premium tarzı).
// Okuma endpoint'i: manager gerektirmez, sadece ekip erişimi yeterli.
const bodySchema = z.object({
  question: z.string().min(3).max(500),
});

export async function POST(req: NextRequest) {
  // Ekip erişimi (okuma; manager DEĞİL).
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;

  // AI yapılandırılmamışsa dürüstçe 503 dön (sahte yanıt üretme).
  if (!isAIConfigured()) {
    return NextResponse.json(
      { success: false, error: 'AI yapılandırılmamış' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  // Body doğrula.
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Geçersiz istek' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  const { question } = parsed.data;

  // Ekip verisini bağlam olarak topla: aktif (arşivsiz) görevler + ekip üyeleri.
  const [tasks, members] = await Promise.all([
    prisma.companyTask.findMany({
      where: { archivedAt: null },
      select: {
        title: true,
        status: true,
        priority: true,
        department: true,
        dueAt: true,
        completedAt: true,
        estimateMin: true,
        spentMin: true,
        assignedTo: { select: { name: true, email: true } },
      },
      take: 300,
    }),
    prisma.user.findMany({
      where: { adminTeamRole: { not: null } },
      select: { name: true, email: true, adminTeamRole: true, adminDepartment: true },
    }),
  ]);

  // Bugünün tarihi — gecikme tespiti için (dueAt < now && status != 'done').
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Görevleri kompakt metin satırlarına çevir.
  const lines = tasks
    .map((t) => {
      const who = t.assignedTo?.name || t.assignedTo?.email || 'atanmamış';
      const due = t.dueAt ? t.dueAt.toISOString().slice(0, 10) : 'yok';
      const overdue = t.dueAt && t.status !== 'done' && t.dueAt < now ? ' [GECİKMİŞ]' : '';
      const dep = t.department ? ` #${t.department}` : '';
      const time =
        t.estimateMin != null || t.spentMin
          ? ` (tahmin:${t.estimateMin ?? '?'}dk/harcanan:${t.spentMin}dk)`
          : '';
      return `- [${t.status}] (${t.priority}) ${t.title}${dep} → ${who} | bitiş:${due}${overdue}${time}`;
    })
    .join('\n');

  // Üye satırları.
  const memberLines = members
    .map(
      (m) =>
        `- ${m.name || m.email} | rol:${m.adminTeamRole ?? '-'}${m.adminDepartment ? ` | departman:${m.adminDepartment}` : ''}`,
    )
    .join('\n');

  // LLM'e sor.
  const res = await runChatCompletion({
    system:
      'Sen bir ekip yönetim asistanısın. Verilen görev listesi ve ekip üyelerine dayanarak SADECE Türkçe, kısa ve net cevap ver. Veriyi say/analiz et. Uydurma. Liste isteniyorsa madde madde.',
    user: `Soru: ${question}\n\nBugün: ${todayStr}\n\nGörevler:\n${lines || 'yok'}\n\nÜyeler:\n${memberLines || 'yok'}`,
    temperature: 0.3,
    maxTokens: 600,
  });

  // AI yanıtı alınamazsa 502.
  if (!res) {
    return NextResponse.json(
      { success: false, error: 'AI yanıtı alınamadı' },
      { status: 502, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { success: true, answer: res.content.trim() },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}
