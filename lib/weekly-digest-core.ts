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

/**
 * (bayi, hafta) için "e-posta henüz teslim edilmedi" işareti (arka plan Y6). Bildirim talebiyle
 * AYNI transaction'da yazılır, başarılı gönderimde silinir. Gönderim başarısız olursa işaret
 * kalır ve sonraki koşu (haftalık iş başarısız sayıldığı için ertesi gün yeniden koşar) e-postayı
 * yeniden dener — eskiden `sendTransactionalEmail` sonucu hiç kontrol edilmiyor, başarısız mail
 * "gönderildi" sayılıyor ve bir daha denenmiyordu.
 * Bu sürümden ÖNCE bildirilmiş haftalarda işaret yoktur → geçmişe dönük yeniden gönderim olmaz.
 */
export function weeklyDigestEmailPendingKey(dealerId: string, weekStart: Date): string {
  return `system:weekly-digest-email-pending:v1:${dealerId}:${weekStart.toISOString()}:`.padEnd(SYSTEM_KEY_MIN_LENGTH, '#');
}

/** Bekleyen e-posta en fazla bu kadar denenir; sonra işaret silinir (sonsuz yeniden deneme yok). */
export const DIGEST_EMAIL_MAX_ATTEMPTS = 3;

function pendingAttempts(responseBody: string | null | undefined): number {
  try {
    const n = (JSON.parse(responseBody || '{}') as { attempts?: unknown }).attempts;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** AI'sız (yeniden deneme yolu) deterministik özet: AI'ya ikinci kez harcama yapılmaz. */
function fallbackSummary(stats: WeekStats, playbook: GrowthPlaybook): string {
  return (
    `Bu hafta ${stats.total} geri bildirim aldınız${stats.avgRating != null ? `, ortalama puan ${stats.avgRating.toFixed(2)}★` : ''}. ` +
    `${stats.negativeCount} negatif, ${stats.churnHighCount} yüksek kayıp riski. Önerilen odak: ${playbook.title}.`
  );
}

async function isDigestEmailOptedOut(dealerId: string): Promise<boolean> {
  // Bayi "Haftalık özet e-postası"nı kapattıysa (Ayarlar › Bildirimler → AISettings.weeklyReportEnabled)
  // uygulama içi bildirim yine düşer, e-posta gönderilmez. Okuma hatasında eski davranış (gönder).
  try {
    const pref = await prisma.aISettings.findUnique({ where: { dealerId }, select: { weeklyReportEnabled: true } });
    return pref?.weeklyReportEnabled === false;
  } catch {
    return false;
  }
}

export type WeeklyDigestStatus = 'sent' | 'no_email' | 'skipped' | 'opted_out' | 'email_failed';

/**
 * E-postayı gönderir ve bekleyen işareti günceller. Başarı → işaret silinir. Belirsiz SMTP
 * hatası (ileti gitmiş olabilir) ya da deneme hakkı bitti → işaret silinir (çift kopya / sonsuz
 * deneme yok) ama sonuç `email_failed` olur (iş başarısız → alarm).
 */
async function deliverDigestEmail(params: {
  pendingKey: string;
  attemptsSoFar: number;
  to: string;
  businessName: string;
  summary: string;
  stats: WeekStats;
  playbook: GrowthPlaybook;
}): Promise<'sent' | 'email_failed'> {
  const r = await sendTransactionalEmail({
    to: params.to,
    subject: digestSubject(params.businessName),
    html: buildEmailHtml(params.businessName, params.summary, params.stats, params.playbook),
    text: params.summary,
  });
  const attempts = params.attemptsSoFar + 1;
  if (r.ok || r.maybeDelivered || attempts >= DIGEST_EMAIL_MAX_ATTEMPTS) {
    await prisma.idempotencyKey.deleteMany({ where: { key: params.pendingKey } }).catch(() => undefined);
    if (!r.ok) console.error('[WEEKLY_DIGEST] e-posta gönderilemedi (yeniden denenmeyecek):', r.error);
    return r.ok ? 'sent' : 'email_failed';
  }
  console.error('[WEEKLY_DIGEST] e-posta gönderilemedi (sonraki koşuda yeniden denenecek):', r.error);
  await prisma.idempotencyKey
    .updateMany({ where: { key: params.pendingKey }, data: { responseBody: JSON.stringify({ attempts }) } })
    .catch(() => undefined);
  return 'email_failed';
}

/** Tek bir bayi için haftalık digest üretir + e-postalar. Döner: durum. */
export async function generateWeeklyDigestForDealer(
  dealer: { id: string; email: string | null; businessName: string | null; name: string | null },
  weekStart: Date
): Promise<{ dealerId: string; status: WeeklyDigestStatus }> {
  const notifyKey = weeklyDigestNotifyKey(dealer.id, weekStart);
  const pendingKey = weeklyDigestEmailPendingKey(dealer.id, weekStart);
  const businessName = dealer.businessName || dealer.name || 'İşletmeniz';
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY);

  // Hızlı yol: bu (bayi, hafta) zaten bildirildiyse AI'ya yeniden harcama yapma. Yalnız önceki
  // koşuda e-postası GİDEMEMİŞSE (bekleyen işaret) e-postayı AI'sız özetle yeniden dene.
  const alreadyNotified = await prisma.idempotencyKey.findUnique({ where: { key: notifyKey } });
  if (alreadyNotified) {
    const pending = await prisma.idempotencyKey.findUnique({ where: { key: pendingKey } });
    if (!pending || !dealer.email) return { dealerId: dealer.id, status: 'skipped' };
    if (await isDigestEmailOptedOut(dealer.id)) {
      await prisma.idempotencyKey.deleteMany({ where: { key: pendingKey } }).catch(() => undefined);
      return { dealerId: dealer.id, status: 'opted_out' };
    }
    const stats = await computeWeekStats(dealer.id, weekStart, prevWeekStart);
    const playbook = matchPlaybook(stats);
    const status = await deliverDigestEmail({
      pendingKey,
      attemptsSoFar: pendingAttempts((pending as { responseBody?: string | null }).responseBody),
      to: dealer.email,
      businessName,
      summary: fallbackSummary(stats, playbook),
      stats,
      playbook,
    });
    return { dealerId: dealer.id, status };
  }

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
  const summary = ai?.content ?? fallbackSummary(stats, playbook);

  // Satır içeriği her çalıştırmada güncellenir (elle "yenile" ile çakışmaz).
  const recommendedAction = `${playbook.title}: ${playbook.dealerActions[0] ?? ''}`;
  await prisma.dealerWeeklyBrief.upsert({
    where: { dealerId_weekStart: { dealerId: dealer.id, weekStart } },
    create: { dealerId: dealer.id, weekStart, topThemes: stats.topThemes as object, recommendedAction },
    update: { topThemes: stats.topThemes as object, recommendedAction },
  });

  const optedOut = dealer.email ? await isDigestEmailOptedOut(dealer.id) : false;
  const wantsEmail = Boolean(dealer.email) && !optedOut;
  const keyExpiresAt = new Date(weekStart.getTime() + NOTIFY_KEY_TTL_DAYS * DAY);

  // Bildirim kararı: tek-seferlik anahtar + bildirim (+ e-posta bekleyen işareti) AYNI
  // transaction'da. Cron yeniden denemesi ya da eşzamanlı iki çalıştırmadan yalnız biri bildirir;
  // bildirim yazılamazsa anahtar da geri alınır (sonraki deneme yeniden gönderebilir).
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.idempotencyKey.createMany({
      data: [
        {
          key: notifyKey,
          route: 'weekly-digest-notify',
          statusCode: 200,
          responseBody: '{}',
          expiresAt: keyExpiresAt,
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
    if (wantsEmail) {
      await tx.idempotencyKey.createMany({
        data: [
          {
            key: pendingKey,
            route: 'weekly-digest-email-pending',
            statusCode: 0,
            responseBody: JSON.stringify({ attempts: 0 }),
            expiresAt: keyExpiresAt,
          },
        ],
        skipDuplicates: true,
      });
    }
    return true;
  });
  if (!claimed) return { dealerId: dealer.id, status: 'skipped' };

  if (!dealer.email) return { dealerId: dealer.id, status: 'no_email' };
  if (optedOut) return { dealerId: dealer.id, status: 'opted_out' };

  const status = await deliverDigestEmail({
    pendingKey,
    attemptsSoFar: 0,
    to: dealer.email,
    businessName,
    summary,
    stats,
    playbook,
  });
  return { dealerId: dealer.id, status };
}

export interface WeeklyDigestRunSummary {
  processed: number;
  sent: number;
  /** E-postası bu koşuda gidemeyen bayi sayısı (bekleyen işaret varsa sonraki koşu yeniden dener). */
  emailFailed: number;
  /** Hata fırlatan bayi sayısı (bildirim/brief yazılamadı; sonraki koşu yeniden dener). */
  failed: number;
  /** Süre bütçesi yüzünden bu koşuda başlatılmayan bayi sayısı (sonraki koşu devam eder). */
  deferred: number;
}

/**
 * Tüm aktif bayiler için geçen haftanın digest'ini üretir. `deadlineAt` (orkestratörün iş son
 * tarihi) yaklaşınca yeni bayiye başlamaz; kalanlar `deferred` döner. Bayi başına tek-seferlik
 * anahtar sayesinde sonraki koşu yalnız kalanları işler (biten bayiler hızlı yoldan atlanır).
 */
export async function runWeeklyDigestForAllDealers(
  now: Date = new Date(),
  opts: { deadlineAt?: number } = {}
): Promise<WeeklyDigestRunSummary> {
  // Geçen tamamlanmış hafta (bu haftanın başından 7 gün öncesi).
  const thisWeekStart = startOfWeekUTC(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY);

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER' },
    select: { id: true, email: true, businessName: true, name: true },
    orderBy: { id: 'asc' },
  });

  // Bir bayi (AI + e-posta) ~birkaç saniye sürer; son tarihe bu paydan az kaldıysa yenisine başlama.
  const PER_DEALER_RESERVE_MS = 8_000;
  const summary: WeeklyDigestRunSummary = { processed: 0, sent: 0, emailFailed: 0, failed: 0, deferred: 0 };
  for (let i = 0; i < dealers.length; i++) {
    if (opts.deadlineAt && Date.now() + PER_DEALER_RESERVE_MS > opts.deadlineAt) {
      summary.deferred = dealers.length - i;
      break;
    }
    const d = dealers[i];
    try {
      const r = await generateWeeklyDigestForDealer(d, lastWeekStart);
      summary.processed++;
      if (r.status === 'sent') summary.sent++;
      if (r.status === 'email_failed') summary.emailFailed++;
    } catch (err) {
      summary.failed++;
      console.error(`[WEEKLY_DIGEST] dealer ${d.id} failed:`, err);
    }
  }
  return summary;
}
