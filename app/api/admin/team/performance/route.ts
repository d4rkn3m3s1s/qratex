import { NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET: üye performans metrikleri (Kişiler/Performans paneli).
 * Her ekip üyesi için: toplam/açık/tamamlanan görev, harcanan-tahmini süre,
 * ortalama döngü süresi (createdAt→completedAt), gecikmiş görev sayısı.
 */
export async function GET() {
  // Ekip performans panosu yönetici-özel gözetim verisidir (üye sekmesi gizli).
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const [members, tasks] = await Promise.all([
    prisma.user.findMany({
      where: { adminTeamRole: { not: null } },
      select: { id: true, name: true, email: true, image: true, adminTeamRole: true, adminDepartment: true },
    }),
    prisma.companyTask.findMany({
      where: { assignedToId: { not: null }, archivedAt: null },
      select: { assignedToId: true, status: true, estimateMin: true, spentMin: true, dueAt: true, createdAt: true, completedAt: true },
      take: 5000,
    }),
  ]);

  const now = new Date();
  const byUser = new Map<string, {
    total: number; done: number; open: number; overdue: number;
    estimateMin: number; spentMin: number; cycleSum: number; cycleCount: number;
  }>();

  for (const t of tasks) {
    if (!t.assignedToId) continue;
    const s = byUser.get(t.assignedToId) ?? { total: 0, done: 0, open: 0, overdue: 0, estimateMin: 0, spentMin: 0, cycleSum: 0, cycleCount: 0 };
    s.total += 1;
    s.estimateMin += t.estimateMin ?? 0;
    s.spentMin += t.spentMin ?? 0;
    if (t.status === 'done') {
      s.done += 1;
      if (t.completedAt) {
        s.cycleSum += (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60); // saat
        s.cycleCount += 1;
      }
    } else {
      s.open += 1;
      if (t.dueAt && new Date(t.dueAt) < now) s.overdue += 1;
    }
    byUser.set(t.assignedToId, s);
  }

  const rows = members.map((m) => {
    const s = byUser.get(m.id) ?? { total: 0, done: 0, open: 0, overdue: 0, estimateMin: 0, spentMin: 0, cycleSum: 0, cycleCount: 0 };
    return {
      id: m.id, name: m.name, email: m.email, image: m.image,
      role: m.adminTeamRole, department: m.adminDepartment,
      total: s.total, done: s.done, open: s.open, overdue: s.overdue,
      completionRate: s.total ? Math.round((s.done / s.total) * 100) : 0,
      estimateMin: s.estimateMin, spentMin: s.spentMin,
      avgCycleHours: s.cycleCount ? Math.round((s.cycleSum / s.cycleCount) * 10) / 10 : null,
    };
  }).sort((a, b) => b.done - a.done);

  return NextResponse.json({ success: true, members: rows }, { headers: PRIVATE_NO_STORE_HEADERS });
}
