import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { sendWeeklyReminderEmail } from '@/lib/team-email';
import { NOT_INITIATIVE } from '@/lib/team/access';
import { effectiveDue } from '@/lib/team/dates';
import { teamPanelBase } from '@/lib/team/href';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { startOfWeekUTC } from '@/lib/timezone';
import { readCronDeadline } from '@/lib/cron-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Haftalık (pazartesi): açık görevi olan her atanana ve onay bekleyen görev varken her
 * yöneticiye özet mail. Arşivdeki görevler ve girişimler sayılmaz; bağlantı alıcının
 * paneline göre (ADMIN → /admin/ekip). Eski sürüm açık görevi olmayan yöneticiye onay
 * özetini hiç göndermiyordu.
 *
 * Teslim güvencesi (arka plan Y6): eskiden gönderim sonucu okunmuyor, gidemeyen mail de
 * "hatırlatıldı" sayılıyor ve iş her zaman başarılı dönüyordu. Artık alıcı × hafta başına
 * tek-seferlik anahtar BAŞARILI gönderimden sonra yazılır; gidemeyen varsa iş `ok:false` + 500
 * döner (alarm) ve orkestratör ertesi gün yeniden koşar — yalnız kalan alıcılara gider, kimse
 * ikinci kopyayı almaz.
 */
const SYSTEM_KEY_MIN_LENGTH = 160;
const KEY_TTL_DAYS = 21;

/** Alıcı × hafta için tek-seferlik anahtar (istemci Idempotency-Key ad uzayına düşemez: >128). */
function teamWeeklyReminderKey(userId: string, weekStart: Date): string {
  return `system:team-weekly-reminder:v1:${userId}:${weekStart.toISOString()}:`.padEnd(SYSTEM_KEY_MIN_LENGTH, '#');
}
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const origin = getPublicAppOrigin().replace(/\/$/, '');

  const open = await prisma.companyTask.findMany({
    where: { AND: [NOT_INITIATIVE, { status: { not: 'done' }, archivedAt: null, assignedToId: { not: null } }] },
    select: { title: true, priority: true, dueAt: true, assignedTo: { select: { id: true, name: true, email: true, role: true } } },
    take: 2000,
  });

  type Bucket = { name: string | null; email: string; role: string; tasks: { title: string; priority: string; dueAt: Date | null }[] };
  const byUser = new Map<string, Bucket>();
  for (const t of open) {
    const u = t.assignedTo;
    if (!u?.email) continue;
    const cur = byUser.get(u.id) ?? { name: u.name, email: u.email, role: String(u.role), tasks: [] };
    cur.tasks.push({ title: t.title, priority: t.priority, dueAt: effectiveDue(t.dueAt) });
    byUser.set(u.id, cur);
  }

  const reviewing = await prisma.companyTask.findMany({
    where: { AND: [NOT_INITIATIVE, { status: 'review', archivedAt: null }] },
    select: { title: true, assignedTo: { select: { name: true } } },
    orderBy: { submittedForReviewAt: 'asc' },
    take: 100,
  });
  const pendingApprovals = reviewing.map((t) => ({ title: t.title, submittedByName: t.assignedTo?.name ?? null }));

  const managers = await prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
    select: { id: true, name: true, email: true, role: true },
  });
  const managerIds = new Set(managers.map((m) => m.id));
  if (pendingApprovals.length > 0) {
    for (const m of managers) {
      if (!byUser.has(m.id) && m.email) byUser.set(m.id, { name: m.name, email: m.email, role: String(m.role), tasks: [] });
    }
  }

  const deadlineAt = readCronDeadline(req, 100_000);
  const weekStart = startOfWeekUTC(new Date());
  const keyOf = new Map([...byUser.keys()].map((uid) => [uid, teamWeeklyReminderKey(uid, weekStart)]));
  const done = keyOf.size
    ? new Set(
        (await prisma.idempotencyKey.findMany({ where: { key: { in: [...keyOf.values()] } }, select: { key: true } })).map(
          (k) => k.key
        )
      )
    : new Set<string>();
  const expiresAt = new Date(weekStart.getTime() + KEY_TTL_DAYS * 86_400_000);

  let sent = 0;
  let alreadySent = 0;
  let deferred = 0;
  const failures: string[] = [];
  for (const [uid, u] of byUser) {
    const key = keyOf.get(uid)!;
    if (done.has(key)) {
      alreadySent++;
      continue;
    }
    if (Date.now() + 5_000 > deadlineAt) {
      deferred++;
      continue;
    }
    const r = await sendWeeklyReminderEmail({
      to: u.email,
      name: u.name,
      openTasks: u.tasks,
      pendingApprovals: managerIds.has(uid) && pendingApprovals.length > 0 ? pendingApprovals : undefined,
      link: `${origin}${teamPanelBase(u.role)}`,
    });
    // Başarı ya da belirsiz sonuç (ileti gitmiş olabilir) → bu hafta bir daha gönderme.
    if (r.ok || r.maybeDelivered) {
      await prisma.idempotencyKey
        .createMany({
          data: [{ key, route: 'team-weekly-reminder', statusCode: 200, responseBody: '{}', expiresAt }],
          skipDuplicates: true,
        })
        .catch((e) => console.error('[team-weekly-reminder] anahtar yazılamadı (çift gönderim riski):', e));
    }
    if (r.ok) {
      if (!r.skipped) sent++;
    } else {
      failures.push(`${uid}: ${r.error.slice(0, 120)}`);
    }
  }

  const ok = failures.length === 0 && deferred === 0;
  const error = ok
    ? undefined
    : [
        failures.length ? `${failures.length} haftalık hatırlatma gönderilemedi` : '',
        deferred ? `${deferred} hatırlatma süre bütçesi yüzünden ertelendi` : '',
      ]
        .filter(Boolean)
        .join('; ');
  return NextResponse.json(
    {
      ok,
      success: ok,
      reminded: sent,
      alreadySent,
      ...(deferred ? { deferred } : {}),
      ...(failures.length ? { failed: failures.length, failures: failures.slice(0, 20) } : {}),
      ...(error ? { error } : {}),
    },
    { status: ok ? 200 : 500 }
  );
}
