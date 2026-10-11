import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';
import { readCronDeadline } from '@/lib/cron-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NEGATIVE_FEEDBACK_SLA_HOURS = parsePositiveIntEnv(process.env.NEGATIVE_FEEDBACK_SLA_HOURS, 24);
const SLA_TYPE = 'negative_feedback_sla_breach';
/** Yalnız son bu kadar günün yanıtsız olumsuz yorumları vaka açar (eski birikim her gün taranmaz). */
const LOOKBACK_DAYS = 30;
/** Koşu başına en fazla aday (en eskiden yeniye; kalanlar ertesi koşuda). */
const MAX_CANDIDATES = 500;

/**
 * Yanıtsız olumsuz yorum SLA'sı (günlük orkestratörden).
 *
 * Arka plan denetimi O5 düzeltmeleri:
 *  - TEK KAYIT: bir yorum için SLA vakası durumundan BAĞIMSIZ bir kez açılır. Eskiden yalnız
 *    açık durumdaki vakalara bakılıyordu → bayi vakayı "çözüldü" yapıp yanıt yazmazsa ertesi
 *    koşuda aynı vaka ve bildirim YENİDEN açılıyordu. Vaka açma geri bildirim başına advisory
 *    kilitle korunur (elle "Şimdi çalıştır" ile eşzamanlı koşu çift vaka açmaz).
 *  - SINIRLI: tüm geçmiş yerine son 30 gün ve koşu başına 500 aday; mevcut vakalar yorum
 *    başına JSON-path sorgusu (N+1) yerine tek sorguda okunur.
 *  - BİLDİRİM YORGUNLUĞU: vaka başına ayrı zil bildirimi yerine bayi başına koşu başına TEK
 *    özet bildirimi ("N yanıtsız olumsuz yorum").
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const deadlineAt = readCronDeadline(req, 60_000);

  const now = Date.now();
  const cutoff = new Date(now - NEGATIVE_FEEDBACK_SLA_HOURS * 60 * 60 * 1000);
  const lookback = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const negatives = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      dealerRepliedAt: null,
      createdAt: { lte: cutoff, gte: lookback },
      OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
    },
    select: { id: true, qrCode: { select: { dealerId: true } } },
    orderBy: { createdAt: 'asc' },
    take: MAX_CANDIDATES,
  });

  const candidates = negatives
    .map((f) => ({ id: f.id, dealerId: f.qrCode?.dealerId ?? null }))
    .filter((f): f is { id: string; dealerId: string } => Boolean(f.dealerId));
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, checked: negatives.length, incidentsCreated: 0, dealersNotified: 0 });
  }

  // Bu yorumlar için HERHANGİ durumda açılmış SLA vakaları (tek sorgu). Vaka, yorumun SLA
  // süresi dolduktan sonra açıldığı için lookback'ten önce oluşturulmuş olamaz.
  const dealerIds = [...new Set(candidates.map((c) => c.dealerId))];
  const existing = await prisma.incident.findMany({
    where: { type: SLA_TYPE, dealerId: { in: dealerIds }, createdAt: { gte: lookback } },
    select: { metadata: true },
  });
  const covered = new Set<string>();
  for (const inc of existing) {
    const m = inc.metadata && typeof inc.metadata === 'object' && !Array.isArray(inc.metadata) ? (inc.metadata as Record<string, unknown>) : {};
    if (typeof m.feedbackId === 'string') covered.add(m.feedbackId);
  }

  const createdByDealer = new Map<string, number>();
  let created = 0;
  let deferred = 0;
  for (const fb of candidates) {
    if (covered.has(fb.id)) continue;
    if (Date.now() + 2_000 > deadlineAt) {
      deferred++;
      continue;
    }
    const opened = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sla-incident:${fb.id}`}))`;
      const dup = await tx.incident.findFirst({
        where: { dealerId: fb.dealerId, type: SLA_TYPE, metadata: { path: ['feedbackId'], equals: fb.id } },
        select: { id: true },
      });
      if (dup) return false;
      await tx.incident.create({
        data: {
          dealerId: fb.dealerId,
          type: SLA_TYPE,
          severity: 'high',
          status: 'open',
          title: `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan olumsuz geri bildirim`,
          description: `Geri bildirim ID: ${fb.id}. SLA aşıldı, lütfen yanıtlayın.`,
          metadata: { feedbackId: fb.id },
        },
      });
      return true;
    });
    if (!opened) continue;
    created++;
    createdByDealer.set(fb.dealerId, (createdByDealer.get(fb.dealerId) ?? 0) + 1);
  }

  // Bayi başına tek özet bildirimi (vaka başına ayrı bildirim yerine).
  let dealersNotified = 0;
  const notifyErrors: string[] = [];
  for (const [dealerId, n] of createdByDealer) {
    try {
      await prisma.notification.create({
        data: {
          userId: dealerId,
          title: '⏰ SLA Aşımı',
          message:
            n === 1
              ? `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan bir olumsuz geri bildirim var. Lütfen yanıtlayın.`
              : `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan ${n} olumsuz geri bildirim var. Lütfen yanıtlayın.`,
          type: 'warning',
          data: { kind: 'sla-breach-summary', count: n, href: '/dealer/inbox/incidents' },
        },
      });
      dealersNotified++;
    } catch (e) {
      notifyErrors.push(`${dealerId}: ${e instanceof Error ? e.message.slice(0, 120) : 'hata'}`);
    }
  }

  const ok = deferred === 0 && notifyErrors.length === 0;
  return NextResponse.json(
    {
      ok,
      checked: negatives.length,
      incidentsCreated: created,
      dealersNotified,
      truncated: negatives.length === MAX_CANDIDATES,
      ...(deferred ? { deferred } : {}),
      ...(notifyErrors.length ? { notifyErrors: notifyErrors.slice(0, 10) } : {}),
      ...(!ok
        ? {
            error: [
              deferred ? `${deferred} SLA vakası süre bütçesi yüzünden ertelendi` : '',
              notifyErrors.length ? `${notifyErrors.length} bayiye SLA bildirimi yazılamadı` : '',
            ]
              .filter(Boolean)
              .join('; '),
          }
        : {}),
    },
    { status: ok ? 200 : 500 }
  );
}
