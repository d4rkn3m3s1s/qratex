/**
 * Haftalık AI digest çekirdeği. Her bayi için geçen haftanın özetini hesaplar,
 * eşleşen growth playbook'u seçer, kısa bir AI özeti üretir, DealerWeeklyBrief'e
 * (idempotent: @@unique[dealerId, weekStart]) yazar ve bayiye e-posta gönderir.
 *
 * DealerWeeklyBrief + GROWTH_PLAYBOOKS + sendTransactionalEmail zaten projede
 * vardı ama hiçbir cron bunları otomatik üretip göndermiyordu — döngü burada kapanır.
 *
 * Çakışma (D10 / P0-14): /dealer/innovation'daki elle "yenile" aynı (bayi, hafta) satırını
 * önceden oluşturunca cron bildirimi + e-postayı sessizce atlıyordu. Bildirim kararı artık
 * satırın varlığından bağımsız, sistem ad uzayındaki atomik tek-seferlik anahtarla
 * (IdempotencyKey, `weeklyDigestNotifyKey`) verilir.
 *
 * HTML kaçışı (P0-35): bayi adı (serbest metin), LLM özeti ve müşteri yorumlarından çıkan
 * temalar e-postaya KAÇIŞLI ve otomatik bağlantıya dönüşmeyecek şekilde girer.
 */
import { prisma } from '@/lib/prisma';
import { startOfWeekUTC } from '@/lib/timezone';
import { GROWTH_PLAYBOOKS, type GrowthPlaybook } from '@/lib/growth-playbooks';
import { runChatCompletion } from '@/lib/ai-engine';
import { sendTransactionalEmail } from '@/lib/mail-sender';
import { escapeEmailHtml, escapeEmailText } from '@/lib/security/escape-html';

const DAY = 24 * 60 * 60 * 1000;

/** Bildirim anahtarının saklama süresi (db-cleanup süresi geçmiş anahtarları siler). */
const NOTIFY_KEY_TTL_DAYS = 60;
/** İstemci Idempotency-Key başlığı en fazla 128 karakter → sistem anahtarı bundan uzun tutulur. */
const SYSTEM_KEY_MIN_LENGTH = 160;

/**
 * (bayi, hafta) için tek-seferlik bildirim anahtarı. Deterministik; istemci
 * Idempotency-Key ad uzayına (16-128 karakter) düşemez.
 */
export function weeklyDigestNotifyKey(dealerId: string, weekStart: Date): string {
  return `system:weekly-digest-notify:v1:${dealerId}:${weekStart.toISOString()}:`.padEnd(SYSTEM_KEY_MIN_LENGTH, '#');
}

export interface WeekStats {
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

/**
 * Haftalık özet e-postası (P0-35). Bayi adı, LLM özeti ve temalar kullanıcı/LLM kaynaklıdır →
 * `escapeEmailText` (kaçış + otomatik bağlantı kırma). Sabit playbook metinleri ve sayılar da
 * `escapeEmailHtml` ile kaçışlanır (savunma derinliği). Testler için dışa açık.
 */
export function buildEmailHtml(businessName: string, summary: string, stats: WeekStats, playbook: GrowthPlaybook): string {
  const ratingLine =
    stats.avgRating != null
      ? `${stats.avgRating.toFixed(2)}★${stats.prevAvgRating != null ? ` (önceki hafta ${stats.prevAvgRating.toFixed(2)}★)` : ''}`
      : 'veri yok';
  const themes =
    stats.topThemes
      .map((t) => `${escapeEmailText(t.theme, { maxLength: 60 })} (${escapeEmailHtml(t.count)})`)
      .join(', ') || 'yok';
  const actions = playbook.dealerActions.map((a) => `<li>${escapeEmailHtml(a)}</li>`).join('');
  return `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2>📊 Haftalık Özet — ${escapeEmailText(businessName, { maxLength: 120 })}</h2>
    <p style="white-space:pre-wrap;line-height:1.5">${escapeEmailText(summary, { maxLength: 4000 })}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 0">Geri bildirim</td><td style="text-align:right"><b>${escapeEmailHtml(stats.total)}</b></td></tr>
      <tr><td style="padding:6px 0">Ortalama puan</td><td style="text-align:right"><b>${escapeEmailHtml(ratingLine)}</b></td></tr>
      <tr><td style="padding:6px 0">Negatif</td><td style="text-align:right"><b>${escapeEmailHtml(stats.negativeCount)}</b></td></tr>
      <tr><td style="padding:6px 0">Yüksek kayıp riski</td><td style="text-align:right"><b>${escapeEmailHtml(stats.churnHighCount)}</b></td></tr>
      <tr><td style="padding:6px 0">Öne çıkan temalar</td><td style="text-align:right">${themes}</td></tr>
    </table>
    <h3>🎯 Önerilen playbook: ${escapeEmailHtml(playbook.title)}</h3>
    <p style="color:#555">${escapeEmailHtml(playbook.summary)}</p>
    <ul>${actions}</ul>
  </div>`;
}

/** E-posta konusu: tek satır (başlık enjeksiyonu yok), makul uzunluk. */
function digestSubject(businessName: string): string {
  // eslint-disable-next-line no-control-regex
  const flat = `📊 Haftalık özet — ${businessName}`.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 159).trimEnd()}…` : flat;
}

/** Tek bir bayi için haftalık digest üretir + e-postalar. Döner: durum. */
export async function generateWeeklyDigestForDealer(
  dealer: { id: string; email: string | null; businessName: string | null; name: string | null },
  weekStart: Date
): Promise<{ dealerId: string; status: 'sent' | 'no_email' | 'skipped' | 'opted_out' }> {
  const notifyKey = weeklyDigestNotifyKey(dealer.id, weekStart);
  // Hızlı yol: bu (bayi, hafta) zaten bildirildiyse AI'ya yeniden harcama yapma.
  const alreadyNotified = await prisma.idempotencyKey.findUnique({ where: { key: notifyKey } });
  if (alreadyNotified) return { dealerId: dealer.id, status: 'skipped' };

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

  // Satır içeriği her çalıştırmada güncellenir (elle "yenile" ile çakışmaz).
  const recommendedAction = `${playbook.title}: ${playbook.dealerActions[0] ?? ''}`;
  await prisma.dealerWeeklyBrief.upsert({
    where: { dealerId_weekStart: { dealerId: dealer.id, weekStart } },
    create: { dealerId: dealer.id, weekStart, topThemes: stats.topThemes as object, recommendedAction },
    update: { topThemes: stats.topThemes as object, recommendedAction },
  });

  // Bildirim kararı: tek-seferlik anahtar + bildirim AYNI transaction'da. Cron yeniden denemesi
  // ya da eşzamanlı iki çalıştırmadan yalnız biri bildirir; bildirim yazılamazsa anahtar da geri
  // alınır (sonraki deneme yeniden gönderebilir).
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.idempotencyKey.createMany({
      data: [
        {
          key: notifyKey,
          route: 'weekly-digest-notify',
          statusCode: 200,
          responseBody: '{}',
          expiresAt: new Date(weekStart.getTime() + NOTIFY_KEY_TTL_DAYS * DAY),
        },
      ],
      skipDuplicates: true,
    });
    if (claim.count === 0) return false;
    await tx.notification.create({
      data: {
        userId: dealer.id,
        title: '📊 Haftalık özetiniz hazır',
        message: summary.slice(0, 240),
        type: 'info',
      },
    });
    return true;
  });
  if (!claimed) return { dealerId: dealer.id, status: 'skipped' };

  if (!dealer.email) return { dealerId: dealer.id, status: 'no_email' };

  // Bayi "Haftalık özet e-postası"nı kapattıysa (Ayarlar › Bildirimler → AISettings.weeklyReportEnabled)
  // uygulama içi bildirim yine düşer, e-posta gönderilmez. Okuma hatasında eski davranış (gönder).
  let optedOut = false;
  try {
    const pref = await prisma.aISettings.findUnique({ where: { dealerId: dealer.id }, select: { weeklyReportEnabled: true } });
    optedOut = pref?.weeklyReportEnabled === false;
  } catch {
    optedOut = false;
  }
  if (optedOut) return { dealerId: dealer.id, status: 'opted_out' };

  const businessName = dealer.businessName || dealer.name || 'İşletmeniz';
  await sendTransactionalEmail({
    to: dealer.email,
    subject: digestSubject(businessName),
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
