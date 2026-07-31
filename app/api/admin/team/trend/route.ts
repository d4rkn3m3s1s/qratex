import { NextRequest, NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { shiftWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

/**
 * GET ?weeks=6&department=slug — son N haftanın (bu hafta dahil) görev sayısı +
 * tamamlanma oranı. KPI sparkline'ı için hafif özet.
 */
export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;

  const weeksParam = Number(req.nextUrl.searchParams.get('weeks') || 6);
  const weeks = Math.max(2, Math.min(12, isNaN(weeksParam) ? 6 : weeksParam));
  const department = req.nextUrl.searchParams.get('department');

  const current = weekKeyOf();
  // En eskiden yeniye haftalar (son N).
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(shiftWeekKey(current, -i));

  const tasks = await prisma.companyTask.findMany({
    where: { weekKey: { in: keys }, ...(department && department !== 'all' ? { department } : {}) },
    select: { weekKey: true, status: true, spentMin: true },
    take: 5000,
  });

  const byWeek = new Map<string, { total: number; done: number; spentMin: number }>();
  for (const k of keys) byWeek.set(k, { total: 0, done: 0, spentMin: 0 });
  for (const t of tasks) {
    if (!t.weekKey) continue;
    const cur = byWeek.get(t.weekKey);
    if (!cur) continue;
    cur.total += 1;
    cur.spentMin += t.spentMin ?? 0;
    if (t.status === 'done') cur.done += 1;
  }

  const series = keys.map((k) => {
    const v = byWeek.get(k)!;
    return { weekKey: k, total: v.total, done: v.done, pct: v.total ? Math.round((v.done / v.total) * 100) : 0, spentHours: Math.round((v.spentMin / 60) * 10) / 10 };
  });

  // Departman kırılımı (radar/karşılaştırma için) — bu haftaki aktif görevlerin departman dağılımı.
  const deptRows = await prisma.companyTask.groupBy({
    by: ['department'],
    where: { weekKey: { in: keys }, archivedAt: null },
    _count: { _all: true },
  }).catch(() => []);
  const byDepartment = deptRows
    .filter((r) => r.department)
    .map((r) => ({ department: r.department as string, count: r._count._all }));

  return NextResponse.json({ success: true, series, byDepartment }, { headers: PRIVATE_NO_STORE_HEADERS });
}
