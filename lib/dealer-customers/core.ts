/**
 * Bayi → Müşteriler (360) — SAF karar mantığı (DB yok; Jest ile doğrudan test edilir).
 *
 * Tek kaynak ilkesi (bayi raporları Bulgu 5 / K6): "segment", "kayıp riski" ve "uyuyan"
 * kavramlarının bu yüzeydeki TEK tanımı buradadır ve hepsi YALNIZ bu işletmenin verisinden
 * (`DealerCustomerStats` satırı) türetilir:
 *  - Risk: bu işletmeye bırakılan yorumların AI kayıp olasılığı ortalaması (eşik 0,5 / 0,3).
 *  - Geri kazanım bandı: son ziyaretten geçen gün ÷ müşterinin KENDİ ziyaret ritmi
 *    (tek ziyaretlide sabit gün bantları). Sabit "30 gün" herkesi aynı kefeye koymaz.
 *  - Etiketler örtüşebilir: bir müşteri hem VIP hem Uyuyan olabilir (eski tek-segment modeli
 *    uyuyan VIP'leri gizliyordu). VIP işletmeye göredir: harcamada üst %10 (sabit 5.000 ₺ değil).
 */
import {
  ATTRIBUTION_WINDOW_DAYS,
  CONTACT_COOLDOWN_DAYS,
  CUSTOMER_TAGS,
  RISK_HIGH,
  RISK_MEDIUM,
  WIN_BACK_BANDS,
  type CustomerTag,
  type ListSortId,
  type MessageTemplate,
  type NextBestAction,
  type RiskLevel,
  type WinBackBand,
} from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** "Aktif" sayılmak için son ziyaret penceresi. */
export const ACTIVE_DAYS = 30;
/** "Yeni" etiketi: ilk ziyaret bu kadar gün içinde. */
export const NEW_DAYS = 30;
/** "Sadık" etiketi: bu işletmede en az bu kadar ziyaret. */
export const LOYAL_MIN_VISITS = 10;
/** VIP: işletmenin müşterileri içinde harcamada üst dilim. */
export const VIP_TOP_SHARE = 0.1;
/** Bir ritmi olan müşteri en erken bu kadar gün sonra "gecikmiş" sayılabilir. */
export const MIN_OVERDUE_DAYS = 14;
/** Kalıcı özet bu kadar saatten eskiyse "bayat" uyarısı. */
export const STALE_HOURS = 36;

export const TAG_LABEL_TR: Readonly<Record<CustomerTag, string>> = {
  at_risk: 'Risk Altında',
  vip: 'VIP',
  loyal: 'Sadık',
  dormant: 'Uyuyan',
  new: 'Yeni',
};

/** Kalıcı tablo ya da canlı hesaptan gelen, YALNIZ bu işletmeye ait müşteri satırı. */
export interface StatRow {
  customerId: string;
  totalSpend: number;
  visitCount: number;
  avgOrderValue: number;
  reviewCount: number;
  avgRating: number | null;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  churnRisk: number | null;
}

export interface EnrichedRow extends StatRow {
  tags: CustomerTag[];
  band: WinBackBand | null;
  risk: RiskLevel;
  daysSinceLast: number | null;
  rhythmDays: number | null;
  /** Geri kazanım önceliği (değer × kurtarılabilirlik × bağlılık); band yoksa 0. */
  priority: number;
}

/* ───────────────────────── Temel hesaplar ───────────────────────── */

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function dateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prisma satırı / önbellek JSON'u / canlı hesap → tek tip satır (eksik alanlara dayanıklı). */
export function toStatRow(raw: Record<string, unknown>): StatRow {
  const churn = raw.churnRisk == null ? null : num(raw.churnRisk, NaN);
  const rating = raw.avgRating == null ? null : num(raw.avgRating, NaN);
  return {
    customerId: String(raw.customerId ?? ''),
    totalSpend: round2(num(raw.totalSpend)),
    visitCount: Math.max(0, Math.round(num(raw.visitCount))),
    avgOrderValue: round2(num(raw.avgOrderValue)),
    reviewCount: Math.max(0, Math.round(num(raw.reviewCount))),
    avgRating: rating != null && Number.isFinite(rating) ? rating : null,
    firstVisitAt: dateOrNull(raw.firstVisitAt),
    lastVisitAt: dateOrNull(raw.lastVisitAt),
    churnRisk: churn != null && Number.isFinite(churn) ? Math.min(1, Math.max(0, churn)) : null,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function daysSince(at: Date | null, now: Date): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
}

/** Ortalama ziyaret aralığı (gün). En az 2 ziyaret ve pozitif süre gerekir. */
export function rhythmDaysOf(row: Pick<StatRow, 'visitCount' | 'firstVisitAt' | 'lastVisitAt'>): number | null {
  if (row.visitCount < 2 || !row.firstVisitAt || !row.lastVisitAt) return null;
  const span = (row.lastVisitAt.getTime() - row.firstVisitAt.getTime()) / DAY_MS;
  if (!(span > 0)) return null;
  return Math.max(1, Math.round((span / (row.visitCount - 1)) * 10) / 10);
}

/**
 * Geri kazanım bandı. Ritmi bilinen müşteride oran = gün ÷ ritim:
 *   < 1,5× ya da < 14 gün → aktif (null) · 1,5–3× uyanmak üzere · 3–6× uyuyor · ≥ 6× ya da ≥ 180 gün kayıp.
 * Tek ziyaretlide: < 30 aktif · 30–59 uyanmak üzere · 60–119 uyuyor · ≥ 120 kayıp.
 */
export function winBackBand(days: number | null, rhythm: number | null): WinBackBand | null {
  if (days == null) return null;
  if (rhythm != null && rhythm > 0) {
    const ratio = days / rhythm;
    if (days < MIN_OVERDUE_DAYS || ratio < 1.5) return null;
    if (days >= 180 || ratio >= 6) return 'lost';
    if (ratio >= 3) return 'sleeping';
    return 'waking';
  }
  if (days < 30) return null;
  if (days < 60) return 'waking';
  if (days < 120) return 'sleeping';
  return 'lost';
}

export function riskLevelOf(churn: number | null): RiskLevel {
  if (churn == null) return 'unknown';
  if (churn >= RISK_HIGH) return 'high';
  if (churn >= RISK_MEDIUM) return 'medium';
  return 'low';
}

/** Geriye uyum (eski istemciler 'HIGH' | 'MEDIUM' | 'LOW' okur). */
export function legacyChurnBucket(level: RiskLevel): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  return level === 'high' ? 'HIGH' : level === 'medium' ? 'MEDIUM' : level === 'low' ? 'LOW' : null;
}

/** İşletmeye göre VIP eşiği: harcamada üst %10'un alt sınırı (en az 1 müşteri; harcama > 0). */
export function computeVipThreshold(rows: ReadonlyArray<Pick<StatRow, 'totalSpend'>>): number | null {
  const spends = rows.map((r) => r.totalSpend).filter((s) => s > 0).sort((a, b) => b - a);
  if (spends.length === 0) return null;
  const k = Math.max(1, Math.ceil(spends.length * VIP_TOP_SHARE));
  return spends[Math.min(k, spends.length) - 1] ?? null;
}

const RECOVERABILITY: Readonly<Record<WinBackBand, number>> = { waking: 1, sleeping: 0.55, lost: 0.2 };

/** Geri kazanım önceliği — deterministik ve açıklanabilir. */
export function winBackPriority(row: Pick<StatRow, 'avgOrderValue' | 'totalSpend' | 'visitCount'>, band: WinBackBand | null): number {
  if (!band) return 0;
  const value = row.avgOrderValue > 0 ? row.avgOrderValue : row.visitCount > 0 ? row.totalSpend / row.visitCount : 0;
  const loyalty = 1 + Math.min(row.visitCount, 20) / 20;
  return round2(Math.max(value, 1) * RECOVERABILITY[band] * loyalty);
}

export function tagsOf(
  row: StatRow,
  ctx: { now: Date; vipThreshold: number | null; band: WinBackBand | null }
): CustomerTag[] {
  const tags: CustomerTag[] = [];
  if (row.churnRisk != null && row.churnRisk >= RISK_HIGH) tags.push('at_risk');
  if (ctx.vipThreshold != null && row.totalSpend > 0 && row.totalSpend >= ctx.vipThreshold) tags.push('vip');
  if (row.visitCount >= LOYAL_MIN_VISITS) tags.push('loyal');
  if (ctx.band) tags.push('dormant');
  const firstDays = daysSince(row.firstVisitAt, ctx.now);
  if (firstDays != null && firstDays <= NEW_DAYS) tags.push('new');
  return tags;
}

export function enrichRows(rows: ReadonlyArray<StatRow>, now: Date): { rows: EnrichedRow[]; vipThreshold: number | null } {
  const vipThreshold = computeVipThreshold(rows);
  const out = rows.map((row) => {
    const d = daysSince(row.lastVisitAt, now);
    const rhythm = rhythmDaysOf(row);
    const band = winBackBand(d, rhythm);
    return {
      ...row,
      daysSinceLast: d,
      rhythmDays: rhythm,
      band,
      risk: riskLevelOf(row.churnRisk),
      tags: tagsOf(row, { now, vipThreshold, band }),
      priority: winBackPriority(row, band),
    };
  });
  return { rows: out, vipThreshold };
}

/* ───────────────────────── Liste sorgusu ───────────────────────── */

export interface ListFilters {
  segment: CustomerTag | null;
  risk: RiskLevel | null;
  band: WinBackBand | null;
}

export function isCustomerTag(v: unknown): v is CustomerTag {
  return typeof v === 'string' && (CUSTOMER_TAGS as readonly string[]).includes(v);
}
export function isWinBackBand(v: unknown): v is WinBackBand {
  return typeof v === 'string' && (WIN_BACK_BANDS as readonly string[]).includes(v);
}
export function isRiskLevel(v: unknown): v is RiskLevel {
  return v === 'high' || v === 'medium' || v === 'low' || v === 'unknown';
}

export function filterRows(rows: ReadonlyArray<EnrichedRow>, f: ListFilters, allowIds?: ReadonlySet<string> | null): EnrichedRow[] {
  return rows.filter(
    (r) =>
      (!f.segment || r.tags.includes(f.segment)) &&
      (!f.risk || r.risk === f.risk) &&
      (!f.band || r.band === f.band) &&
      (!allowIds || allowIds.has(r.customerId))
  );
}

export type SortSpec = { id: ListSortId; desc: boolean };

const SORT_VALUE: Readonly<Record<ListSortId, (r: EnrichedRow) => number | null>> = {
  spend: (r) => r.totalSpend,
  visits: (r) => r.visitCount,
  avg: (r) => r.avgOrderValue,
  lastVisit: (r) => r.lastVisitAt?.getTime() ?? null,
  risk: (r) => r.churnRisk,
};

/** Kararlı sıralama; boş değerler yön ne olursa olsun SONA (eski `predictedChurn desc` NULLS FIRST hatası). */
export function sortRows(rows: ReadonlyArray<EnrichedRow>, sort: SortSpec): EnrichedRow[] {
  const get = SORT_VALUE[sort.id];
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      const d = sort.desc ? b.v - a.v : a.v - b.v;
      return d !== 0 ? d : b.r.totalSpend - a.r.totalSpend || a.i - b.i;
    })
    .map((x) => x.r);
}

/** `spend.desc` biçimini çözer; bilinmeyen alan → varsayılan. */
export function parseSortParam(raw: string | null | undefined): SortSpec {
  const fallback: SortSpec = { id: 'spend', desc: true };
  if (!raw) return fallback;
  const first = raw.split(',')[0]?.trim() ?? '';
  const dot = first.lastIndexOf('.');
  const id = (dot > 0 ? first.slice(0, dot) : first) as ListSortId;
  const dir = dot > 0 ? first.slice(dot + 1) : 'desc';
  if (!(id in SORT_VALUE) || (dir !== 'asc' && dir !== 'desc')) return fallback;
  return { id, desc: dir === 'desc' };
}

/** Eski `?sort=churn|recent|spend` parametresini yeni biçime çevirir. */
export function legacySortAlias(raw: string | null | undefined): string | null {
  if (raw === 'churn') return 'risk.desc';
  if (raw === 'recent') return 'lastVisit.desc';
  if (raw === 'spend') return 'spend.desc';
  return raw ?? null;
}

/** Sayfa sınırları (1 tabanlı; sayfa boyutu 1–100; taşan sayfa son sayfaya çekilir). */
export function paginateGuard(total: number, page: number, pageSize: number): { page: number; pageSize: number; start: number } {
  const size = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { page: p, pageSize: size, start: (p - 1) * size };
}

/** Arama dizgisini sadeleştirir (en fazla 80 karakter; kontrol karakterleri atılır). */
export function normalizeSearch(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/* ───────────────────────── Özetler ───────────────────────── */

export function summarize(rows: ReadonlyArray<EnrichedRow>, now: Date) {
  const bands: Record<WinBackBand, number> = { waking: 0, sleeping: 0, lost: 0 };
  const tags: Record<CustomerTag, number> = { at_risk: 0, vip: 0, loyal: 0, dormant: 0, new: 0 };
  let active30 = 0;
  let newThisMonth = 0;
  let totalRevenue = 0;
  let repeat = 0;
  for (const r of rows) {
    if (r.band) bands[r.band]++;
    for (const t of r.tags) tags[t]++;
    if (r.daysSinceLast != null && r.daysSinceLast <= ACTIVE_DAYS) active30++;
    const firstDays = daysSince(r.firstVisitAt, now);
    if (firstDays != null && firstDays <= NEW_DAYS) newThisMonth++;
    totalRevenue += r.totalSpend;
    if (r.visitCount >= 2) repeat++;
  }
  const total = rows.length;
  return {
    total,
    active30,
    newThisMonth,
    atRisk: tags.at_risk,
    dormant: bands.waking + bands.sleeping + bands.lost,
    bands,
    tags,
    totalRevenue: round2(totalRevenue),
    avgCustomerValue: total > 0 ? round2(totalRevenue / total) : null,
    repeatRate: total > 0 ? Math.round((repeat / total) * 1000) / 10 : null,
  };
}

/**
 * Risk altındaki aylık ciro tahmini: uyanmak üzere + uyuyan müşterilerin bu işletmedeki
 * ortalama sepeti × normal aylık ziyaret sıklığı (30 ÷ ritim, en fazla 8; ritmi bilinmeyen
 * tek ziyaretlide ayda 1). Varsayım arayüzde açıkça yazılır.
 */
export function monthlyAtStake(rows: ReadonlyArray<EnrichedRow>): number {
  let sum = 0;
  for (const r of rows) {
    if (r.band !== 'waking' && r.band !== 'sleeping') continue;
    const perMonth = r.rhythmDays ? Math.min(8, 30 / r.rhythmDays) : 1;
    sum += r.avgOrderValue * perMonth;
  }
  return Math.round(sum);
}

export function segmentCards(rows: ReadonlyArray<EnrichedRow>) {
  const total = rows.length;
  return CUSTOMER_TAGS.map((tag) => {
    const members = rows.filter((r) => r.tags.includes(tag));
    const spend = members.reduce((s, r) => s + r.totalSpend, 0);
    const risks = members.map((r) => r.churnRisk).filter((c): c is number => c != null);
    return {
      tag,
      name: TAG_LABEL_TR[tag],
      count: members.length,
      share: total > 0 ? Math.round((members.length / total) * 1000) / 10 : 0,
      totalSpend: round2(spend),
      avgSpend: members.length > 0 ? round2(spend / members.length) : null,
      avgRisk: risks.length > 0 ? Math.round((risks.reduce((a, b) => a + b, 0) / risks.length) * 100) / 100 : null,
    };
  });
}

/* ───────────────────────── Açıklanabilirlik ───────────────────────── */

export interface ReasonInput {
  churnRisk: number | null;
  band: WinBackBand | null;
  daysSinceLast: number | null;
  rhythmDays: number | null;
  avgRating: number | null;
  reviewCount: number;
  latestNegativeUnanswered: boolean;
  openOffer: boolean;
}

const fmt1 = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** "Neden?" — yalnız ölçülmüş verilerden kurulan kısa gerekçeler (LLM yok). */
export function explainReasons(i: ReasonInput): string[] {
  const out: string[] = [];
  if (i.churnRisk != null && i.churnRisk >= RISK_MEDIUM) {
    out.push(`Bu işletmeye bıraktığı yorumların AI analizine göre kayıp olasılığı %${Math.round(i.churnRisk * 100)}.`);
  }
  if (i.band && i.daysSinceLast != null) {
    out.push(
      i.rhythmDays
        ? `Normalde yaklaşık ${fmt1(i.rhythmDays)} günde bir geliyor; ${i.daysSinceLast} gündür gelmedi.`
        : `Tek ziyareti var ve ${i.daysSinceLast} gündür gelmedi.`
    );
  }
  if (i.avgRating != null && i.reviewCount > 0 && i.avgRating <= 3) {
    out.push(`Puan ortalaması ${fmt1(i.avgRating)} (${i.reviewCount} değerlendirme).`);
  }
  if (i.latestNegativeUnanswered) out.push('Son olumsuz yorumu henüz yanıtlanmadı.');
  if (i.openOffer) out.push('Müşteriye açık bir telafi/kişisel teklif bekliyor.');
  return out;
}

export function suggestNextAction(i: {
  tags: ReadonlyArray<CustomerTag>;
  band: WinBackBand | null;
  risk: RiskLevel;
  latestNegativeUnanswered: boolean;
  reachable: boolean;
  contactedRecently: boolean;
  openOffer: boolean;
}): NextBestAction {
  if (i.latestNegativeUnanswered) return 'reply';
  if (!i.reachable || i.contactedRecently) return null;
  if ((i.band === 'waking' || i.band === 'sleeping') && i.risk === 'high' && !i.openOffer) return 'personal_offer';
  if (i.band === 'waking' || i.band === 'sleeping') return 'winback';
  if (i.risk === 'high' && !i.openOffer) return 'personal_offer';
  if (i.tags.includes('new')) return 'welcome';
  if (i.tags.includes('vip') || i.tags.includes('loyal')) return 'thanks';
  return null;
}

/* ───────────────────────── Gönderim ───────────────────────── */

const TEMPLATE_TEXT: Readonly<Record<'tr' | 'en', Record<MessageTemplate, { title: string; body: (biz: string) => string }>>> = {
  tr: {
    winback: { title: 'Sizi özledik', body: (b) => `${b} sizi yeniden ağırlamak istiyor.` },
    thanks: { title: 'Teşekkür ederiz', body: (b) => `${b}: Bizi tercih ettiğiniz için teşekkür ederiz.` },
    welcome: { title: 'Hoş geldiniz', body: (b) => `${b} ailesine hoş geldiniz! Bir sonraki ziyaretinizde görüşmek üzere.` },
    checkin: { title: 'Fikriniz bizim için önemli', body: (b) => `${b}: Son deneyiminizi önemsiyoruz; düşüncelerinizi duymak isteriz.` },
  },
  en: {
    winback: { title: 'We miss you', body: (b) => `${b} would love to welcome you back.` },
    thanks: { title: 'Thank you', body: (b) => `${b}: Thank you for choosing us.` },
    welcome: { title: 'Welcome', body: (b) => `Welcome to ${b}! See you on your next visit.` },
    checkin: { title: 'Your opinion matters', body: (b) => `${b}: We care about your last experience and would love to hear from you.` },
  },
};

/** Bayinin serbest notu: düz metin, kontrol karakterleri atılır, en fazla `max` karakter. */
export function sanitizeNote(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

/**
 * Müşteriye giden ileti. Vaat içeren hazır metin YOK (eski "5X puan" vaadi sistemde karşılıksızdı):
 * şablonlar yalnız davet/teşekkür/hoş geldin/fikir sorma içerir; somut teklif ancak gerçek bir
 * kişisel teklif kaydıyla (telafi şablonları) verilir.
 */
export function buildActionMessage(
  template: MessageTemplate,
  businessName: string,
  note: string,
  lang: 'tr' | 'en' = 'tr'
): { title: string; message: string } {
  const t = TEMPLATE_TEXT[lang][template];
  const biz = businessName.trim() || (lang === 'en' ? 'Your favourite place' : 'Favori mekânınız');
  const body = t.body(biz);
  return { title: t.title, message: note ? `${body}\n\n${note}` : body };
}

export interface RecipientCandidate {
  customerId: string;
  /** Uygun değilse neden (müşteri hesabı değil / anonimleştirilmiş). */
  eligibleAccount: boolean;
  /** "Kampanya & Sürprizler" uygulama içi ya da push açık mı? */
  reachable: boolean;
  /** Son `CONTACT_COOLDOWN_DAYS` gün içinde bu işletmeden ileti/teklif aldı mı? */
  contactedRecently: boolean;
}

/**
 * Alıcıları sırayla (çağıranın öncelik sırası korunur) eler: hesap → tercih (İYS/izin) →
 * sıklık tavanı → gönderim/gün tavanı. Sayılar önizlemede ve sonuçta AYNEN gösterilir.
 */
export function partitionRecipients(candidates: ReadonlyArray<RecipientCandidate>, cap: number) {
  const eligible: string[] = [];
  let ineligible = 0;
  let optedOut = 0;
  let cooldown = 0;
  let overCap = 0;
  for (const c of candidates) {
    if (!c.eligibleAccount) ineligible++;
    else if (!c.reachable) optedOut++;
    else if (c.contactedRecently) cooldown++;
    else if (eligible.length >= cap) overCap++;
    else eligible.push(c.customerId);
  }
  return { eligible, skipped: { ineligible, optedOut, cooldown, overCap } };
}

export function cooldownSince(now: Date): Date {
  return new Date(now.getTime() - CONTACT_COOLDOWN_DAYS * DAY_MS);
}

/** Atıf: gönderimden sonraki pencere içinde bu işletmede ziyareti olan alıcılar ve ciro. */
export function attributeOutcome(
  sentAt: Date,
  recipients: ReadonlyArray<string>,
  visits: ReadonlyArray<{ customerId: string; createdAt: Date; amount: number | null }>,
  now: Date
): { returned: number; revenue: number; windowOpen: boolean } {
  const end = sentAt.getTime() + ATTRIBUTION_WINDOW_DAYS * DAY_MS;
  const set = new Set(recipients);
  const back = new Set<string>();
  let revenue = 0;
  for (const v of visits) {
    const t = v.createdAt.getTime();
    if (!set.has(v.customerId) || t <= sentAt.getTime() || t > end) continue;
    back.add(v.customerId);
    revenue += v.amount ?? 0;
  }
  return { returned: back.size, revenue: Math.round(revenue), windowOpen: now.getTime() < end };
}

/* ───────────────────────── Zaman / CSV ───────────────────────── */

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

/** İstanbul takvim günü (`YYYY-MM-DD`). */
export function istanbulDayKey(d: Date): string {
  return IST_DAY.format(d);
}

/** İstanbul gününün başlangıç anı (UTC). Türkiye 2016'dan beri sabit UTC+3. */
export function istanbulDayStart(now: Date): Date {
  const key = istanbulDayKey(now);
  return new Date(`${key}T00:00:00+03:00`);
}

/** Son `weeks` adet 7 günlük kovada ortalama (en eski → en yeni; boş kova null). */
export function weeklyAverages(points: ReadonlyArray<{ at: Date; value: number }>, now: Date, weeks = 8): Array<number | null> {
  const sums = new Array<number>(weeks).fill(0);
  const counts = new Array<number>(weeks).fill(0);
  for (const p of points) {
    const ageDays = (now.getTime() - p.at.getTime()) / DAY_MS;
    if (ageDays < 0 || ageDays >= weeks * 7) continue;
    const idx = weeks - 1 - Math.floor(ageDays / 7);
    sums[idx]! += p.value;
    counts[idx]!++;
  }
  return sums.map((s, i) => (counts[i]! > 0 ? Math.round((s / counts[i]!) * 1000) / 1000 : null));
}

/** CSV hücresi: formül enjeksiyonuna karşı (=,+,-,@ ile başlayan) önek + tırnak kaçışı. */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  // Excel (TR) için BOM + noktalı virgül ayırıcı.
  const lines = [header.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`;
}
