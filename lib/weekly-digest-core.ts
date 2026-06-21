/**
 * Haftalık AI digest çekirdeği. Her bayi için geçen haftanın özetini hesaplar,
 * eşleşen growth playbook'u seçer, kısa bir AI özeti üretir, DealerWeeklyBrief'e
 * (idempotent: @@unique[dealerId, weekStart]) yazar ve bayiye e-posta gönderir.
 *
 * DealerWeeklyBrief + GROWTH_PLAYBOOKS + sendTransactionalEmail zaten projede
 * vardı ama hiçbir cron bunları otomatik üretip göndermiyordu — döngü burada kapanır.
 */
import { prisma } from '@/lib/prisma';
import { startOfWeekUTC } from '@/lib/timezone';
import { GROWTH_PLAYBOOKS, type GrowthPlaybook } from '@/lib/growth-playbooks';
import { runChatCompletion } from '@/lib/ai-engine';
import { sendTransactionalEmail } from '@/lib/mail-sender';

const DAY = 24 * 60 * 60 * 1000;

interface WeekStats {
  total: number;
  prevTotal: number;
  avgRating: number | null;
  prevAvgRating: number | null;
  negativeCount: number;
  churnHighCount: number;
  topThemes: Array<{ theme: string; count: number }>;
}

async function computeWeekStats(dealerId: string, weekStart: Date, prevWeekStart: Date): Promise<WeekStats> {
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
  const baseWhere = { qrCode: { dealerId }, deletedAt: null };

  const [thisAgg, prevAgg, negativeCount, churnHighCount, themeRows] = await Promise.all([
    prisma.feedback.aggregate({ where: { ...baseWhere, createdAt: { gte: weekStart, lt: weekEnd } }, _avg: { rating: true }, _count: true }),
    prisma.feedback.aggregate({ where: { ...baseWhere, createdAt: { gte: prevWeekStart, lt: weekStart } }, _avg: { rating: true }, _count: true }),
    prisma.feedback.count({ where: { ...baseWhere, createdAt: { gte: weekStart, lt: weekEnd }, OR: [{ rating: { lte: 3 } }, { sentiment: 'negative' }] } }),
    prisma.feedback.count({ where: { ...baseWhere, createdAt: { gte: weekStart, lt: weekEnd }, churnRisk: { gte: 0.7 } } }),
    prisma.feedback.findMany({ where: { ...baseWhere, createdAt: { gte: weekStart, lt: weekEnd } }, select: { topics: true }, take: 300 }),
  ]);

  const counts = new Map<string, number>();
  for (const f of themeRows) {
    const arr = Array.isArray(f.topics) ? (f.topics as unknown[]) : [];
    for (const t of arr) if (typeof t === 'string') counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const topThemes = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([theme, count]) => ({ theme, count }));

  return {
    total: thisAgg._count,
    prevTotal: prevAgg._count,
    avgRating: thisAgg._avg.rating,
    prevAvgRating: prevAgg._avg.rating,
    negativeCount,
    churnHighCount,
    topThemes,
  };
}

/** Hafta istatistiklerine göre en uygun playbook'u seçer (basit kural eşleştirme). */
function matchPlaybook(stats: WeekStats): GrowthPlaybook {
  const ratingDropped =
    stats.avgRating != null && stats.prevAvgRating != null && stats.avgRating < stats.prevAvgRating - 0.2;
  const highNegativeShare = stats.total > 0 && stats.negativeCount / stats.total > 0.4;

  if (stats.churnHighCount > 0 || (ratingDropped && highNegativeShare)) {
    return GROWTH_PLAYBOOKS.find((p) => p.id === 'low_nps_churn') ?? GROWTH_PLAYBOOKS[0];
  }
  if (stats.total === 0 || (stats.prevTotal > 0 && stats.total < stats.prevTotal * 0.5)) {
    return GROWTH_PLAYBOOKS.find((p) => p.id === 'first_week_dropoff') ?? GROWTH_PLAYBOOKS[0];
  }
  return GROWTH_PLAYBOOKS.find((p) => p.id === 'silent_happy') ?? GROWTH_PLAYBOOKS[0];
}

function buildEmailHtml(businessName: string, summary: string, stats: WeekStats, playbook: GrowthPlaybook): string {
  const ratingLine =
    stats.avgRating != null
      ? `${stats.avgRating.toFixed(2)}★${stats.prevAvgRating != null ? ` (önceki hafta ${stats.prevAvgRating.toFixed(2)}★)` : ''}`
      : 'veri yok';
  const themes = stats.topThemes.map((t) => `${t.theme} (${t.count})`).join(', ') || 'yok';
  const actions = playbook.dealerActions.map((a) => `<li>${a}</li>`).join('');
  return `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2>📊 Haftalık Özet — ${businessName}</h2>
    <p style="white-space:pre-wrap;line-height:1.5">${summary}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 0">Geri bildirim</td><td style="text-align:right"><b>${stats.total}</b></td></tr>
      <tr><td style="padding:6px 0">Ortalama puan</td><td style="text-align:right"><b>${ratingLine}</b></td></tr>
      <tr><td style="padding:6px 0">Negatif</td><td style="text-align:right"><b>${stats.negativeCount}</b></td></tr>
      <tr><td style="padding:6px 0">Yüksek kayıp riski</td><td style="text-align:right"><b>${stats.churnHighCount}</b></td></tr>
      <tr><td style="padding:6px 0">Öne çıkan temalar</td><td style="text-align:right">${themes}</td></tr>
    </table>
    <h3>🎯 Önerilen playbook: ${playbook.title}</h3>
    <p style="color:#555">${playbook.summary}</p>
    <ul>${actions}</ul>
  </div>`;
}

/** Tek bir bayi için haftalık digest üretir + e-postalar. Döner: durum. */
export async function generateWeeklyDigestForDealer(
  dealer: { id: string; email: string | null; businessName: string | null; name: string | null },
  weekStart: Date
): Promise<{ dealerId: string; status: 'sent' | 'no_email' | 'skipped' }> {
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY);
  const stats = await computeWeekStats(dealer.id, weekStart, prevWeekStart);
  const playbook = matchPlaybook(stats);

  // AI özeti (yapılandırılmamışsa deterministik fallback).
  const ai = await runChatCompletion({
    dealerId: dealer.id,
    temperature: 0.4,
    maxTokens: 320,
    system:
      'Sen bir işletme analitiği asistanısın. Verilen haftalık metriklerden Türkçe, 3-4 cümlelik, somut ve aksiyona dönük bir özet yaz. Sayı uydurma; yalnızca verilenleri kullan.',
    user: `Metikler: ${JSON.stringify(stats)}\nÖnerilen playbook: ${playbook.title} — ${playbook.summary}`,
  });
  const summary =
    ai?.content ??
    `Bu hafta ${stats.total} geri bildirim aldınız${stats.avgRating != null ? `, ortalama puan ${stats.avgRating.toFixed(2)}★` : ''}. ` +
      `${stats.negativeCount} negatif, ${stats.churnHighCount} yüksek kayıp riski. Önerilen odak: ${playbook.title}.`;

  // DealerWeeklyBrief'i ATOMİK oluştur: yalnızca bu (dealerId, weekStart) için
  // İLK kez oluşturulduğunda bildirim+e-posta gönderilir. createMany(skipDuplicates)
  // bize "yeni mi yazıldı" bilgisini count ile verir → cron retry'ı veya elle
  // yeniden POST aynı haftada bildirim/e-postayı TEKRAR göndermez (rank 10).
  const recommendedAction = `${playbook.title}: ${playbook.dealerActions[0] ?? ''}`;
  const created = await prisma.dealerWeeklyBrief.createMany({
    data: [
      {
        dealerId: dealer.id,
        weekStart,
        topThemes: stats.topThemes as object,
        recommendedAction,
      },
    ],
    skipDuplicates: true,
  });
  const isFirstTime = created.count > 0;
  if (!isFirstTime) {
    // Zaten vardı: içeriği güncelle ama yeniden gönderme.
    await prisma.dealerWeeklyBrief.update({
      where: { dealerId_weekStart: { dealerId: dealer.id, weekStart } },
      data: { topThemes: stats.topThemes as object, recommendedAction },
    });
    return { dealerId: dealer.id, status: 'skipped' };
  }

  // Bildirim (in-app) — yalnızca ilk üretimde.
  await prisma.notification.create({
    data: {
      userId: dealer.id,
      title: '📊 Haftalık özetiniz hazır',
      message: summary.slice(0, 240),
      type: 'info',
    },
  });

  if (!dealer.email) return { dealerId: dealer.id, status: 'no_email' };

  const businessName = dealer.businessName || dealer.name || 'İşletmeniz';
  await sendTransactionalEmail({
    to: dealer.email,
    subject: `📊 Haftalık özet — ${businessName}`,
    html: buildEmailHtml(businessName, summary, stats, playbook),
    text: summary,
  });

  return { dealerId: dealer.id, status: 'sent' };
}

/** Tüm aktif bayiler için geçen haftanın digest'ini üretir. Döner: özet sayımlar. */
export async function runWeeklyDigestForAllDealers(now: Date = new Date()): Promise<{ processed: number; sent: number }> {
  // Geçen tamamlanmış hafta (bu haftanın başından 7 gün öncesi).
  const thisWeekStart = startOfWeekUTC(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY);

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER' },
    select: { id: true, email: true, businessName: true, name: true },
  });

  let processed = 0;
  let sent = 0;
  for (const d of dealers) {
    try {
      const r = await generateWeeklyDigestForDealer(d, lastWeekStart);
      processed++;
      if (r.status === 'sent') sent++;
    } catch (err) {
      console.error(`[WEEKLY_DIGEST] dealer ${d.id} failed:`, err);
    }
  }
  return { processed, sent };
}
