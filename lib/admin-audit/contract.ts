/**
 * /admin/audit sözleşmesi (saf; istemci + sunucu). URL anahtarları = API sorgu anahtarları:
 * sayfa durumu paylaşılabilir, derin bağlantı (`/admin/audit?aktor=<id>&onem=critical`) aynen
 * API'ye gider.
 */
import { z } from 'zod';
import { AUDIT_CATEGORIES, AUDIT_SEVERITIES, type AuditCategory, type AuditSeverity } from './catalog';

export const AUDIT_PERIODS = ['1s', '24s', '7g', '30g'] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];
export const PERIOD_LABEL: Record<AuditPeriod, string> = { '1s': 'Son 1 saat', '24s': 'Son 24 saat', '7g': 'Son 7 gün', '30g': 'Son 30 gün' };
export const PERIOD_MS: Record<AuditPeriod, number> = { '1s': 3_600_000, '24s': 86_400_000, '7g': 7 * 86_400_000, '30g': 30 * 86_400_000 };

export const ACTOR_KINDS = ['user', 'system', 'cron', 'deleted'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];
export const ACTOR_KIND_LABEL: Record<ActorKind, string> = {
  user: 'Kullanıcı',
  system: 'Sistem',
  cron: 'Zamanlanmış görev',
  deleted: 'Silinmiş kullanıcı',
};

export const ACTOR_ROLES = ['ADMIN', 'DEALER', 'STAFF', 'CUSTOMER'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];
export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Yönetici', DEALER: 'Bayi', STAFF: 'Personel', CUSTOMER: 'Müşteri' };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CODE_RE = /^[A-Za-z0-9_.:${}-]{1,80}$/;

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const list = (re: RegExp, max: number) =>
  z.preprocess(
    (v) => {
      const raw = Array.isArray(v) ? v.join(',') : v;
      if (typeof raw !== 'string' || raw.trim() === '') return undefined;
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
    z.array(z.string().regex(re, 'Geçersiz değer')).max(max).optional()
  );

const filterShape = {
  q: z.preprocess(blankToUndef, z.string().trim().min(2, 'Arama en az 2 karakter olmalı').max(120).optional()),
  varlik: list(CODE_RE, 20),
  eylem: list(CODE_RE, 20),
  kategori: z.preprocess(blankToUndef, z.enum(AUDIT_CATEGORIES).optional()),
  onem: z.preprocess(blankToUndef, z.enum(AUDIT_SEVERITIES).optional()),
  aktor: z.preprocess(blankToUndef, z.string().regex(ID_RE, 'Geçersiz kullanıcı').optional()),
  rol: z.preprocess(blankToUndef, z.enum(ACTOR_ROLES).optional()),
  tur: z.preprocess(blankToUndef, z.enum(ACTOR_KINDS).optional()),
  donem: z.preprocess(blankToUndef, z.enum(AUDIT_PERIODS).optional()),
  from: z.preprocess(blankToUndef, z.string().regex(DAY_RE, 'Tarih YYYY-AA-GG olmalı').optional()),
  to: z.preprocess(blankToUndef, z.string().regex(DAY_RE, 'Tarih YYYY-AA-GG olmalı').optional()),
};

const rangeOk = (v: { from?: string; to?: string }) => !(v.from && v.to && v.from > v.to);
const rangeMsg = { message: 'Başlangıç günü bitişten sonra olamaz', path: ['from'] };

export const auditFilterSchema = z.object(filterShape).refine(rangeOk, rangeMsg);
export type AuditFilter = z.infer<typeof auditFilterSchema>;

export const auditListQuerySchema = z
  .object({
    ...filterShape,
    siralama: z.preprocess(blankToUndef, z.enum(['yeni', 'eski']).default('yeni')),
    limit: z.preprocess(blankToUndef, z.coerce.number().int().min(10).max(100).default(25)),
    cursor: z.preprocess(blankToUndef, z.string().max(200).optional()),
  })
  .refine(rangeOk, rangeMsg);

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const FILTER_KEYS = ['q', 'varlik', 'eylem', 'kategori', 'onem', 'aktor', 'rol', 'tur', 'donem', 'from', 'to'] as const;

/** Süzgeç → sorgu dizgisi (boş alanlar atlanır, sıra kararlı → önbellek anahtarı). */
export function buildAuditQs(f: Partial<Record<(typeof FILTER_KEYS)[number] | 'siralama', string | string[] | undefined | null>>): string {
  const sp = new URLSearchParams();
  for (const key of [...FILTER_KEYS, 'siralama'] as const) {
    const v = f[key];
    const s = Array.isArray(v) ? v.join(',') : v;
    if (s && s.trim()) sp.set(key, s.trim());
  }
  return sp.toString();
}

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export type AuditActor = {
  kind: ActorKind;
  userId: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  /** Kullanıcı silinmiş ama anlık görüntü var / yok. */
  deleted: boolean;
  /** Ad/e-posta yazım anındaki anlık görüntüden mi geliyor. */
  fromSnapshot: boolean;
};

export type AuditRow = {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  label: string;
  entityLabel: string;
  category: AuditCategory;
  severity: AuditSeverity;
  actor: AuditActor;
};

export type AuditPage = {
  items: AuditRow[];
  nextCursor: string | null;
  /** Yalnız ilk sayfada (imleçsiz) hesaplanır. */
  total: number | null;
};

export type FacetItem = { value: string; label: string; count: number };
export type ActorFacet = { userId: string; email: string | null; name: string | null; role: string | null; count: number };

export type AuditFacets = {
  windowDays: number;
  entities: FacetItem[];
  actions: FacetItem[];
  actors: ActorFacet[];
};

export type AuditSummary = {
  last24h: number;
  critical24h: number;
  last7d: number;
  total: number;
  deletedActor: number;
  oldestAt: string | null;
};

export type DiffChange = 'added' | 'removed' | 'changed' | 'same';
export type DiffRow = { path: string; before: string | null; after: string | null; change: DiffChange; secret: boolean };

export type RevertKind = 'settings' | 'seo';

export type AuditDetail = AuditRow & {
  ip: string | null;
  device: string | null;
  userAgent: string | null;
  diff: DiffRow[];
  diffTruncated: boolean;
  /** Ham JSON (gizli anahtarlar maskeli). */
  oldData: unknown;
  newData: unknown;
  redactedCount: number;
  entityHref: string | null;
  revert: { kind: RevertKind; endpoint: string } | null;
  /** Aynı varlık kaydının diğer denetim olayları (en çok 10). */
  related: Array<{ id: string; at: string; label: string; severity: AuditSeverity; actorLabel: string }>;
};
