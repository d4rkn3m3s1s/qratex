/**
 * Segmentler (a-segmentler) — saf alan mantığı (Jest ile test edilir; prisma/React yok).
 *
 * Tek doğruluk kaynağı: günlük CLV cron'unun (`lib/clv-core.ts#recomputeAllCLV`) yazdığı
 * `CustomerLifetimeValue.segmentId` → `CustomerSegment` kayıt defteri. Bu sayfa segmenti
 * KENDİSİ HESAPLAMAZ (eski uç 10.000 satırda kesiliyor, silinmiş yorumları sayıyordu);
 * yalnız kayıt defterini, sayımları ve kuralların insan dilindeki karşılığını gösterir.
 */

// ───────────────────────────── Segment kayıt defteri ─────────────────────────────

/** `lib/clv-core.ts#DEFAULT_SEGMENTS` adları → kararlı anahtar. */
export const KNOWN_SEGMENT_KEYS = ['new', 'loyal', 'vip', 'at_risk', 'sleeping'] as const;
export type KnownSegmentKey = (typeof KNOWN_SEGMENT_KEYS)[number];

const NAME_TO_KEY: Readonly<Record<string, KnownSegmentKey>> = {
  VIP: 'vip',
  Sadık: 'loyal',
  'Risk Altında': 'at_risk',
  Uyuyan: 'sleeping',
  Yeni: 'new',
};

export function segmentKeyForName(name: string): KnownSegmentKey | null {
  return NAME_TO_KEY[name] ?? null;
}

/**
 * `pickSegment` öncelik sırası (ilk eşleşen kazanır). Kural metni koddaki eşiklerle birebir
 * aynıdır — `__tests__/admin/a-segmentler/domain.test.ts` bu eşleşmeyi korur.
 */
export const SEGMENT_PRIORITY: readonly KnownSegmentKey[] = ['at_risk', 'vip', 'loyal', 'sleeping', 'new'];

/** Yaşam döngüsü okuma sırası (kartlar): Yeni → Sadık → VIP, alt şerit Risk → Uyuyan. */
export const LIFECYCLE_ORDER: readonly KnownSegmentKey[] = ['new', 'loyal', 'vip', 'at_risk', 'sleeping'];

/** Kayıt defterinde olmayan iki sanal kova. */
export const VIRTUAL_SEGMENTS = ['none', 'uncomputed'] as const;
export type VirtualSegment = (typeof VIRTUAL_SEGMENTS)[number];

export function isVirtualSegment(id: string): id is VirtualSegment {
  return (VIRTUAL_SEGMENTS as readonly string[]).includes(id);
}

export interface SegmentSummary {
  /** `CustomerSegment.id` ya da sanal kova (`none` | `uncomputed`). */
  id: string;
  key: KnownSegmentKey | VirtualSegment | null;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  count: number;
  /** Toplam müşteri içindeki pay (tam sayı, toplam 100'e tamamlanır). */
  share: number;
  avgSpent: number | null;
  avgChurn: number | null;
}

export interface SegmentOverview {
  computedAt: string;
  /** CLV cron'unun en son çalıştığı an (en büyük `calculatedAt`). */
  clvComputedAt: string | null;
  totals: {
    /** Pay paydası: anonimleşmemiş, demo olmayan, gölge yasaklı olmayan müşteriler. */
    customers: number;
    withClv: number;
    /** CLV kaydı olmayan müşteri (hiç tüketimi yok ya da cron henüz çalışmadı). */
    uncomputed: number;
    /** CLV hesaplandı ama hiçbir kurala uymadı. */
    unsegmented: number;
    /** Gölge yasaklı (`shadow_ban`) — paya girmez, ayrıca gösterilir. */
    excludedSuspicious: number;
  };
  segments: SegmentSummary[];
  pendingProposals: number;
}

/**
 * En büyük kalan yöntemiyle yüzde: payların toplamı tam 100 olur (eski sayfada her dilim
 * ayrı yuvarlandığı için toplam %99/%101 çıkıyordu). Toplam 0 ise hepsi 0.
 */
export function largestRemainderPercents(counts: readonly number[]): number[] {
  const total = counts.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((c) => (Math.max(0, c) / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors;
}

/** Kartlar: bilinen segmentler yaşam döngüsü sırasıyla, sonra özel segmentler (ada göre), en sonda sanal kovalar. */
export function orderSegments<T extends { id: string; key: string | null; name: string }>(rows: readonly T[]): T[] {
  const rank = (r: T) => {
    if (r.key === 'none') return 1000;
    if (r.key === 'uncomputed') return 1001;
    const i = r.key ? LIFECYCLE_ORDER.indexOf(r.key as KnownSegmentKey) : -1;
    return i >= 0 ? i : 100;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr'));
}

// ───────────────────────────── Üye listesi ─────────────────────────────

export const MEMBER_SORT_KEYS = ['spent', 'visits', 'last', 'churn', 'name'] as const;
export type MemberSortKey = (typeof MEMBER_SORT_KEYS)[number];
export const MEMBER_PAGE_SIZES = [20, 50, 100] as const;
export const EXPORT_ROW_CAP = 10_000;

/** Segment başına anlamlı varsayılan sıralama (rapor B8). */
export function defaultMemberSort(key: string | null): { id: MemberSortKey; desc: boolean } {
  switch (key) {
    case 'at_risk':
      return { id: 'churn', desc: true };
    case 'sleeping':
      return { id: 'last', desc: false };
    case 'new':
      return { id: 'last', desc: true };
    case 'uncomputed':
      return { id: 'name', desc: false };
    default:
      return { id: 'spent', desc: true };
  }
}

export interface SegmentMember {
  userId: string;
  name: string | null;
  email: string | null;
  totalSpent: number | null;
  totalVisits: number | null;
  avgOrderValue: number | null;
  lastPurchaseAt: string | null;
  predictedChurn: number | null;
  churnRisk: string | null;
  level: number;
  points: number;
  fraudStatus: string;
}

export interface SegmentMembersPage {
  segment: { id: string; name: string; key: string | null };
  items: SegmentMember[];
  total: number;
  page: number;
  size: number;
  sort: { id: MemberSortKey; desc: boolean };
}

// ───────────────────────────── Segment önerileri (onay kuyruğu) ─────────────────────────────

export const PROPOSAL_STATUSES = ['PENDING', 'APPROVED', 'SENT', 'REJECTED'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export function isProposalStatus(v: unknown): v is ProposalStatus {
  return typeof v === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(v);
}

/** Yönetici kararı yalnız iki yönlü: PENDING → APPROVED | REJECTED. `SENT` yalnız gerçek gönderim ucunun yazabileceği durumdur. */
export const ADMIN_DECISIONS = ['APPROVED', 'REJECTED'] as const;
export type AdminDecision = (typeof ADMIN_DECISIONS)[number];

/** Açık durum makinesi (rapor Bulgu 1). Geri dönüş yok. */
const TRANSITIONS: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SENT'],
  SENT: [],
  REJECTED: [],
};

export function canTransition(from: string, to: string): boolean {
  return isProposalStatus(from) && isProposalStatus(to) && TRANSITIONS[from].includes(to);
}

export const INNOVATION_SEGMENT_KEYS = ['sleeping', 'loyal', 'first_visit'] as const;
export type InnovationSegmentKey = (typeof INNOVATION_SEGMENT_KEYS)[number];

export function isInnovationSegmentKey(v: unknown): v is InnovationSegmentKey {
  return typeof v === 'string' && (INNOVATION_SEGMENT_KEYS as readonly string[]).includes(v);
}

export const PROPOSAL_PAGE_SIZES = [20, 50] as const;
export const DECISION_NOTE_MIN = 5;
export const DECISION_NOTE_MAX = 500;
export const BULK_MAX = 50;
/** Gönderim ucunun alıcı tavanı (`send/route.ts#MAX_SEND`). */
export const SEND_CAP = 500;
/** Bekleme SLA'sı (saat): bunu aşan bekleyen öneri uyarı tonunda gösterilir. */
export const PENDING_SLA_HOURS = 48;

/** Ret gerekçesi zorunlu; onay notu isteğe bağlı. Kırpılmış not ya da doğrulama hatası döner. */
export function validateDecisionNote(decision: AdminDecision, note: string | null | undefined): { ok: true; note: string | null } | { ok: false; reason: 'required' | 'too_short' | 'too_long' } {
  const n = (note ?? '').trim();
  if (n.length > DECISION_NOTE_MAX) return { ok: false, reason: 'too_long' };
  if (decision === 'REJECTED') {
    if (!n) return { ok: false, reason: 'required' };
    if (n.length < DECISION_NOTE_MIN) return { ok: false, reason: 'too_short' };
  }
  return { ok: true, note: n || null };
}

/** Bekleme yaşı (saat, aşağı yuvarlanmış). */
export function ageHours(createdAt: Date | string, now: Date = new Date()): number {
  const t = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

/** Metin normalizasyonu: şablondan değiştirilmemiş mi? (boşluk farkı yok sayılır) */
export function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

export interface ProposalRow {
  id: string;
  title: string;
  message: string;
  segmentKey: string;
  status: ProposalStatus | string;
  createdAt: string;
  decidedAt: string | null;
  ageHours: number;
  dealer: { id: string; label: string; isDemo: boolean };
  decidedBy: { id: string; label: string } | null;
  decisionNote: string | null;
  /** Gerçek gönderimdeki ulaşılan alıcı sayısı (yalnız SENT; analitik kaydından). */
  sentCount: number | null;
  templateUnchanged: boolean;
}

export interface ProposalListResult {
  items: ProposalRow[];
  total: number;
  page: number;
  size: number;
  counts: Record<ProposalStatus, number>;
  oldestPendingHours: number | null;
  featureEnabled: boolean;
  computedAt: string;
}

export interface ProposalAudience {
  /** Segment tanımına uyan tekil müşteri (tavan öncesi). */
  candidates: number;
  /** Gönderimde dikkate alınacak (≤ SEND_CAP). */
  considered: number;
  truncated: boolean;
  /** Kampanya bildirimlerine izin veren ve ulaşılabilir alıcı. */
  reach: number;
  optedOut: number;
}

export interface ProposalDetail extends ProposalRow {
  audience: ProposalAudience | null;
  audienceError: boolean;
  dealerStats: { sentLast30d: number; proposalsLast30d: number; rejectedLast30d: number };
  recent: Array<{ id: string; title: string; status: string; createdAt: string }>;
  history: Array<{ id: string; action: string; at: string; actor: string | null; note: string | null }>;
}

export interface DecideResult {
  id: string;
  status: AdminDecision;
}

export interface BulkDecideResult {
  results: Array<{ id: string; ok: true; status: AdminDecision } | { id: string; ok: false; code: string; message: string; current?: string }>;
}

// ───────────────────────────── Modüller (inovasyon yapılandırması) ─────────────────────────────

export const MODULE_FEATURE_KEYS = [
  'segmentProposals',
  'flashOffers',
  'tablePulse',
  'weeklyBrief',
  'remedyTimeline',
  'staffTableInsights',
  'nearbyRadar',
  'partnerDigestApi',
] as const;
export type ModuleFeatureKey = (typeof MODULE_FEATURE_KEYS)[number];

export interface ModulesState {
  /** İyimser kilit sürümü (`Settings.updatedAt` ISO; kayıt yoksa null). */
  version: string | null;
  features: Record<ModuleFeatureKey, boolean>;
  referral: { maxInvitesPerReferrerLifetime: number; maxRedemptionsPerReferralCodePerMonth: number };
  partnerDigest: { enabled: boolean; url: string; hasSecret: boolean; secretLast4: string | null };
}

/** Gizli değer asla geri dönmez: yalnız var mı + son 4 karakter. */
export function maskSecret(secret: string | null | undefined): { hasSecret: boolean; secretLast4: string | null } {
  const s = (secret ?? '').trim();
  if (!s) return { hasSecret: false, secretLast4: null };
  return { hasSecret: true, secretLast4: s.length >= 8 ? s.slice(-4) : null };
}

/** İç ağ / meta veri adreslerini reddeder (SSRF, rapor Bulgu 4). Yalnız https. */
export function isPublicHttpsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (!host.includes('.') && !host.includes(':')) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:')) return false;
  }
  return true;
}

/** Bayrak değişikliklerinin farkı (denetim izi için). */
export function diffFlags(before: Record<string, boolean>, after: Record<string, boolean>): Array<{ key: string; from: boolean; to: boolean }> {
  const out: Array<{ key: string; from: boolean; to: boolean }> = [];
  for (const k of Object.keys(after)) {
    if (before[k] !== after[k]) out.push({ key: k, from: !!before[k], to: !!after[k] });
  }
  return out;
}
