/**
 * Komuta Merkezi saf hesapları (DB'siz, test edilebilir).
 *
 * Zaman modeli (platform-pulse B3 kapanışı): kartlar ve nabız şeridi AYNI kovaları sayar.
 * Pencere İstanbul saat/gün sınırına hizalıdır; son kova "sürüyor" (kısmi). Önceki pencere
 * aynı geçen süredir → kısmi bugün, tam bir günle kıyaslanmaz.
 *
 * Türkiye 2016'dan beri kalıcı UTC+3 (yaz saati yok); SQL tarafı yine de
 * `AT TIME ZONE 'Europe/Istanbul'` kullanır, JS tarafı sabit ofsetle aynı anahtarları üretir.
 */
import type {
  CommandRange,
  CommandWindow,
  EventActor,
  HealthCheck,
  HealthStatus,
  QueueTone,
} from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const ISTANBUL_OFFSET_MS = 3 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC an → İstanbul yerel kova anahtarı (`YYYY-MM-DDTHH`). */
export function istanbulKey(instant: Date, unit: 'hour' | 'day'): string {
  const local = new Date(instant.getTime() + ISTANBUL_OFFSET_MS);
  const hh = unit === 'day' ? '00' : pad(local.getUTCHours());
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${hh}`;
}

/** Pencere: 24 sa → 24 saatlik kova; 7 g / 30 g → İstanbul günleri (bugün dahil). */
export function resolveWindow(range: CommandRange, now: Date = new Date()): CommandWindow & { startDate: Date; prevStartDate: Date; endDate: Date } {
  const unit: 'hour' | 'day' = range === '24h' ? 'hour' : 'day';
  const count = range === '24h' ? 24 : range === '7d' ? 7 : 30;
  const step = unit === 'hour' ? HOUR : DAY;
  const localMs = now.getTime() + ISTANBUL_OFFSET_MS;
  const currentBucketLocal = Math.floor(localMs / step) * step;
  const startMs = currentBucketLocal - (count - 1) * step - ISTANBUL_OFFSET_MS;
  const elapsed = now.getTime() - startMs;
  const prevStartMs = startMs - elapsed;
  const keys: string[] = [];
  for (let i = 0; i < count; i++) keys.push(istanbulKey(new Date(startMs + i * step), unit));
  return {
    range,
    unit,
    start: new Date(startMs).toISOString(),
    end: now.toISOString(),
    prevStart: new Date(prevStartMs).toISOString(),
    keys,
    startDate: new Date(startMs),
    prevStartDate: new Date(prevStartMs),
    endDate: now,
  };
}

/** Kova satırlarını pencerenin anahtar sırasına yerleştirir (eksik kova = 0). */
export function fillSeries(keys: readonly string[], rows: ReadonlyArray<{ key: string; n: number }>): number[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.key, (map.get(r.key) ?? 0) + r.n);
  return keys.map((k) => map.get(k) ?? 0);
}

/** Göreli değişim (%). Önceki 0 iken tanımsız → null (sahte "+%100" yok). */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Oran (%), payda 0 ise null. */
export function ratioPct(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export const RANGE_COMPARE_LABEL: Record<CommandRange, string> = {
  '24h': 'önceki 24 saate göre',
  '7d': 'önceki 7 güne göre',
  '30d': 'önceki 30 güne göre',
};

// ─────────────── Sağlık sınıflandırması ───────────────

export function dbStatus(latencyMs: number | null): HealthStatus {
  if (latencyMs == null) return 'error';
  if (latencyMs > 1000) return 'error';
  if (latencyMs > 300) return 'warn';
  return 'ok';
}

export type CronSnapshot = {
  lastRun: { startedAt: string; finishedAt: string | null; overall: string; failed: string[] } | null;
  running: { startedAt: string } | null;
} | null;

/** Günlük tek cron (§4.4-12): 26 saatten eski koşu = kaçırıldı. Okunamazsa bilinmiyor. */
export function cronHealth(snapshot: CronSnapshot, now: Date = new Date()): Pick<HealthCheck, 'status' | 'detail'> {
  if (!snapshot) return { status: 'unknown', detail: 'Cron durumu okunamadı' };
  if (snapshot.running) return { status: 'ok', detail: `Şu an çalışıyor (${relativeTr(snapshot.running.startedAt, now)} başladı)` };
  const last = snapshot.lastRun;
  if (!last) return { status: 'warn', detail: 'Henüz kayıtlı koşu yok' };
  const age = now.getTime() - new Date(last.startedAt).getTime();
  const when = relativeTr(last.startedAt, now);
  if (!Number.isFinite(age) || age > 26 * HOUR) return { status: 'error', detail: `Son koşu ${when}; günlük iş kaçırılmış olabilir` };
  if (last.overall === 'failed' || last.overall === 'interrupted') return { status: 'error', detail: `Son koşu ${when} başarısız` };
  if (last.overall === 'partial') {
    const n = last.failed?.length ?? 0;
    return { status: 'warn', detail: `Son koşu ${when}; ${n} iş hata verdi` };
  }
  return { status: 'ok', detail: `Son koşu ${when}, sorunsuz` };
}

export function aiHealth(total: number, failed: number): Pick<HealthCheck, 'status' | 'detail'> {
  if (total === 0) return { status: 'unknown', detail: 'Son 24 saatte AI çağrısı yok' };
  const rate = failed / total;
  const pct = Math.round(rate * 1000) / 10;
  const detail = `Son 24 sa: ${total} çağrı, %${pct.toLocaleString('tr-TR')} hata`;
  if (total >= 10 && rate > 0.2) return { status: 'error', detail };
  if (rate > 0.05) return { status: 'warn', detail };
  return { status: 'ok', detail };
}

const STATUS_RANK: Record<HealthStatus, number> = { ok: 0, unknown: 1, warn: 2, error: 3 };

export function overallHealth(statuses: readonly HealthStatus[]): HealthStatus {
  let worst: HealthStatus = 'ok';
  for (const s of statuses) if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  return worst;
}

// ─────────────── Kuyruk tonu ───────────────

export function queueTone(count: number, urgent = false): QueueTone {
  if (count <= 0) return 'success';
  return urgent ? 'danger' : 'warning';
}

// ─────────────── Göreli zaman ───────────────

export function relativeTr(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'bilinmeyen zamanda';
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return 'az önce';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

// ─────────────── Denetim olayını insan diline çevirme ───────────────

/** `settings`/`Settings`/`SETTINGS`, `company_task`/`CompanyTask` → aynı anahtar (B2). */
export function normalizeEntity(entity: string): string {
  return entity.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

const ENTITY_LABELS: Record<string, string> = {
  settings: 'Ayarlar',
  setting: 'Ayarlar',
  user: 'Kullanıcı',
  feedback: 'Geri bildirim',
  consumption: 'Tüketim',
  consumptionreview: 'Tüketim yorumu',
  physicalcard: 'Fiziksel kart',
  card: 'Kart',
  qrcode: 'QR kod',
  reward: 'Ödül',
  userreward: 'Ödül talebi',
  badge: 'Rozet',
  quest: 'Görev',
  userquest: 'Görev',
  coupon: 'Kupon',
  campaign: 'Kampanya',
  seasonalcampaign: 'Sezon kampanyası',
  surprisebox: 'Sürpriz kutu',
  usersurprisebox: 'Sürpriz kutu',
  featureflag: 'Özellik bayrağı',
  webhook: 'Webhook',
  apikey: 'API anahtarı',
  partner: 'Partner',
  pricingplan: 'Fiyat planı',
  theme: 'Tema',
  page: 'Sayfa',
  menuitem: 'Menü öğesi',
  squad: 'Klan',
  squadbattle: 'Klan savaşı',
  pointsledger: 'Puan defteri',
  points: 'Puan',
  datasubjectrequest: 'KVKK talebi',
  privacyrequest: 'KVKK talebi',
  suspiciousactivity: 'Şüpheli etkinlik',
  incident: 'Vaka',
  companytask: 'Ekip görevi',
  adminteammember: 'Ekip üyesi',
  department: 'Departman',
  dealerstaff: 'Personel',
  remedyoffer: 'Telafi teklifi',
  survey: 'Anket',
  product: 'Ürün',
  donation: 'Bağış',
  donationproject: 'Bağış projesi',
  referral: 'Davet',
  session: 'Oturum',
  password: 'Şifre',
  profile: 'Profil',
  module: 'Modül',
  modulecontrols: 'Modül kontrolleri',
  admingate: 'Yönetici kapısı',
  aisettings: 'AI ayarları',
  aitone: 'AI tonu',
  segment: 'Segment',
  segmentcampaignproposal: 'Segment önerisi',
};

export function entityLabel(entity: string): string {
  const key = normalizeEntity(entity);
  if (ENTITY_LABELS[key]) return ENTITY_LABELS[key];
  // Bilinmeyen: ham değeri okunur kıl ("user_automation_rule" → "User automation rule").
  const words = entity
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toLocaleUpperCase('tr-TR') + words.slice(1) : 'Kayıt';
}

const VERB_RULES: Array<[RegExp, string]> = [
  [/(^|_|\b)(create|created|add|added|insert|new)(_|\b|$)/i, 'oluşturdu'],
  [/(^|_|\b)(delete|deleted|remove|removed|purge)(_|\b|$)/i, 'sildi'],
  [/(^|_|\b)(archive|archived)(_|\b|$)/i, 'arşivledi'],
  [/(^|_|\b)(restore|restored|rollback|revert|undo)(_|\b|$)/i, 'geri aldı'],
  [/(^|_|\b)(approve|approved)(_|\b|$)/i, 'onayladı'],
  [/(^|_|\b)(reject|rejected)(_|\b|$)/i, 'reddetti'],
  [/(^|_|\b)(resolve|resolved|complete|completed)(_|\b|$)/i, 'tamamladı'],
  [/(^|_|\b)(claim|claimed|redeem|redeemed)(_|\b|$)/i, 'talep etti'],
  [/(^|_|\b)(login|signin)(_|\b|$)/i, 'giriş yaptı'],
  [/(^|_|\b)(export|download)(_|\b|$)/i, 'dışa aktardı'],
  [/(^|_|\b)(send|sent|notify|notified)(_|\b|$)/i, 'gönderdi'],
  [/(^|_|\b)(ban|banned|suspend|suspended|block)(_|\b|$)/i, 'kısıtladı'],
  [/(^|_|\b)(adjust|grant|granted)(_|\b|$)/i, 'düzenledi'],
  [/(^|_|\b)(update|updated|edit|edited|change|changed|set|toggle|toggled|patch)(_|\b|$)/i, 'güncelledi'],
];

export function actionVerb(action: string): string {
  // camelCase → snake (updateSettings → update_Settings) ki kelime sınırı çalışsın.
  const a = action.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  for (const [re, verb] of VERB_RULES) if (re.test(a)) return verb;
  return 'işlem yaptı';
}

export function actorKindOf(actorType: string | null | undefined, role: string | null | undefined): Exclude<EventActor, 'all'> {
  if (actorType === 'system' || actorType === 'cron') return 'system';
  if (role === 'ADMIN') return 'admin';
  if (role === 'DEALER' || role === 'STAFF') return 'dealer';
  if (role === 'CUSTOMER') return 'customer';
  return 'system';
}
