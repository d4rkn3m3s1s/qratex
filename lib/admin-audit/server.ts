/**
 * /admin/audit sunucu çekirdeği — kanonik denetim gezgini.
 *
 * Rapor bulguları (docs/audit/2026-10-08/admin/admin_audit.md):
 *  - B3: varlık/eylem eşleşmesi büyük/küçük harfe duyarsız; seçenekler gerçek veriden (facet);
 *    kategori/önem filtresi katalogdaki alt dizgi kurallarının birebir SQL karşılığı.
 *  - B4: gün aralığı İstanbul günü, bitiş `lt (gün + 1)`; ters aralık 400 (sözleşmede).
 *  - B2/B6: liste ucu yalnız özet alanlar; `oldData/newData` ayrı detay ucundan, gizli anahtarlar
 *    maskeli, IP maskeli. Alan bazlı fark sunucuda.
 *  - B9: imleçli (keyset) sayfalama; toplam yalnız ilk sayfada.
 *  - B1: aktör, kullanıcı silinse de `actorSnapshot`'tan okunur ("Silinmiş kullanıcı").
 */
import type { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { cachedJson } from '@/lib/redis';
import { maskIpAddress } from '@/lib/request-metadata';
import { isProtectedSettingKey } from '@/lib/admin-gate';
import { SEO_SETTINGS_KEY } from '@/lib/seo-settings';
import { auditEntry, type AuditActor as WriterActor } from '@/lib/data-safety/audit';
import { decodeCursor, encodeCursor } from '@/lib/customer-wallet/cursor';
import {
  CATEGORY_LABEL,
  CATEGORY_PATTERNS,
  CRITICAL_PATTERNS,
  HIGH_PATTERNS,
  SEVERITY_LABEL,
  actionLabel,
  categoryOf,
  entityHref,
  entityKey,
  entityLabel,
  severityOf,
  type AuditCategory,
  type AuditSeverity,
} from './catalog';
import {
  ACTOR_KIND_LABEL,
  PERIOD_MS,
  ROLE_LABEL,
  type ActorFacet,
  type AuditActor,
  type AuditDetail,
  type AuditFacets,
  type AuditFilter,
  type AuditListQuery,
  type AuditPage,
  type AuditRow,
  type AuditSummary,
  type DiffRow,
  type FacetItem,
  type RevertKind,
} from './contract';

type Db = typeof prismaClient;
type Where = Prisma.AuditLogWhereInput;

export const EXPORT_CAP = 20_000;
const FACET_WINDOW_DAYS = 90;
const DIFF_ROW_CAP = 400;
const VALUE_CAP = 600;
const DAY_MS = 86_400_000;

// ───────────────────────────── Zaman (Europe/Istanbul, UTC+3 sabit) ─────────────────────────────

/** İstanbul günü → o günün başladığı an. Türkiye 2016'dan beri yaz saati uygulamıyor (UTC+3). */
export function istanbulDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export function istanbulDay(d: Date): string {
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function addDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

// ───────────────────────────── Sınıflandırma → SQL ─────────────────────────────

const containsAny = (patterns: readonly string[]): Where[] => patterns.map((p) => ({ action: { contains: p, mode: 'insensitive' } }));

/** `categoryOf` ile birebir: kendi kalıplarından biri VAR ve önceki kategorilerin hiçbiri YOK. */
export function categoryWhere(cat: AuditCategory): Where {
  const all = CATEGORY_PATTERNS.flatMap(([, p]) => p);
  if (cat === 'other') return { NOT: containsAny(all) };
  const idx = CATEGORY_PATTERNS.findIndex(([c]) => c === cat);
  const own = CATEGORY_PATTERNS[idx][1];
  const earlier = CATEGORY_PATTERNS.slice(0, idx).flatMap(([, p]) => p);
  return earlier.length ? { AND: [{ OR: containsAny(own) }, { NOT: containsAny(earlier) }] } : { OR: containsAny(own) };
}

/** `severityOf` ile birebir. */
export function severityWhere(sev: AuditSeverity): Where {
  if (sev === 'critical') return { OR: containsAny(CRITICAL_PATTERNS) };
  if (sev === 'high') return { AND: [{ OR: containsAny(HIGH_PATTERNS) }, { NOT: containsAny(CRITICAL_PATTERNS) }] };
  return { NOT: containsAny([...CRITICAL_PATTERNS, ...HIGH_PATTERNS]) };
}

export function buildWhere(f: AuditFilter, now: Date = new Date()): Where {
  const and: Where[] = [];
  if (f.varlik?.length) and.push({ OR: f.varlik.map((e) => ({ entity: { equals: e, mode: 'insensitive' } })) });
  if (f.eylem?.length) and.push({ OR: f.eylem.map((a) => ({ action: { equals: a, mode: 'insensitive' } })) });
  if (f.kategori) and.push(categoryWhere(f.kategori));
  if (f.onem) and.push(severityWhere(f.onem));
  if (f.aktor) and.push({ userId: f.aktor });
  if (f.rol) and.push({ OR: [{ user: { is: { role: f.rol } } }, { userId: null, actorSnapshot: { path: ['role'], equals: f.rol } }] });
  if (f.tur === 'user') and.push({ actorType: 'user', userId: { not: null } });
  else if (f.tur === 'deleted') and.push({ actorType: 'user', userId: null });
  else if (f.tur) and.push({ actorType: f.tur });

  const createdAt: Prisma.DateTimeFilter = {};
  if (f.donem) createdAt.gte = new Date(now.getTime() - PERIOD_MS[f.donem]);
  if (f.from) {
    const start = istanbulDayStart(f.from);
    if (!createdAt.gte || start > (createdAt.gte as Date)) createdAt.gte = start;
  }
  if (f.to) createdAt.lt = istanbulDayStart(addDay(f.to));
  if (createdAt.gte || createdAt.lt) and.push({ createdAt });

  if (f.q) {
    const q = f.q;
    and.push({
      OR: [
        { entityId: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { entity: { contains: q, mode: 'insensitive' } },
        { user: { is: { email: { contains: q, mode: 'insensitive' } } } },
        { user: { is: { name: { contains: q, mode: 'insensitive' } } } },
        { actorSnapshot: { path: ['email'], string_contains: q } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

// ───────────────────────────── Satır eşleme ─────────────────────────────

const ROW_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entity: true,
  entityId: true,
  userId: true,
  actorType: true,
  actorSnapshot: true,
  user: { select: { id: true, email: true, name: true, role: true } },
} satisfies Prisma.AuditLogSelect;

type RowRecord = Prisma.AuditLogGetPayload<{ select: typeof ROW_SELECT }>;

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

export function resolveActor(row: Pick<RowRecord, 'userId' | 'actorType' | 'actorSnapshot' | 'user'>): AuditActor {
  const snap = obj(row.actorSnapshot);
  if (row.user) {
    return {
      kind: 'user',
      userId: row.user.id,
      email: row.user.email ?? str(snap?.email),
      name: row.user.name ?? str(snap?.name),
      role: String(row.user.role ?? str(snap?.role) ?? '') || null,
      deleted: false,
      fromSnapshot: false,
    };
  }
  if (row.actorType === 'system' || row.actorType === 'cron') {
    return { kind: row.actorType, userId: null, email: null, name: null, role: null, deleted: false, fromSnapshot: false };
  }
  return {
    kind: 'deleted',
    userId: null,
    email: str(snap?.email),
    name: str(snap?.name),
    role: str(snap?.role),
    deleted: true,
    fromSnapshot: !!snap && !!(str(snap.email) || str(snap.name) || str(snap.role)),
  };
}

export function actorDisplay(a: AuditActor): string {
  if (a.kind === 'system' || a.kind === 'cron') return ACTOR_KIND_LABEL[a.kind];
  const who = a.name ?? a.email;
  if (a.deleted) return who ? `${who} (silinmiş)` : 'Silinmiş kullanıcı';
  return who ?? 'Adsız kullanıcı';
}

export function toRow(r: RowRecord): AuditRow {
  return {
    id: r.id,
    at: r.createdAt.toISOString(),
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    label: actionLabel(r.action, r.entity),
    entityLabel: entityLabel(r.entity),
    category: categoryOf(r.action),
    severity: severityOf(r.action),
    actor: resolveActor(r),
  };
}

// ───────────────────────────── Liste ─────────────────────────────

export async function listAudit(db: Db, q: AuditListQuery, now: Date = new Date()): Promise<AuditPage> {
  const base = buildWhere(q, now);
  const dir: 'asc' | 'desc' = q.siralama === 'eski' ? 'asc' : 'desc';
  const cursor = decodeCursor(q.cursor);
  const where: Where = cursor
    ? {
        AND: [
          base,
          dir === 'desc'
            ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }
            : { OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.id } }] },
        ],
      }
    : base;
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: [{ createdAt: dir }, { id: dir }], take: q.limit + 1, select: ROW_SELECT }),
    cursor ? Promise.resolve(null) : db.auditLog.count({ where: base }),
  ]);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toRow),
    nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    total,
  };
}

// ───────────────────────────── Facet + özet ─────────────────────────────

export async function computeFacets(db: Db, now: Date = new Date()): Promise<AuditFacets> {
  const since = new Date(now.getTime() - FACET_WINDOW_DAYS * DAY_MS);
  const where: Where = { createdAt: { gte: since } };
  const [entities, actions, actors] = await Promise.all([
    db.auditLog.groupBy({ by: ['entity'], where, _count: { _all: true } }),
    db.auditLog.groupBy({ by: ['action'], where, _count: { _all: true } }),
    db.auditLog.groupBy({ by: ['userId'], where: { ...where, userId: { not: null } }, _count: { _all: true }, orderBy: { _count: { userId: 'desc' } }, take: 30 }),
  ]);

  // Varlık: `settings`/`Settings` tek seçenek (değer = en sık yazım; sunucu zaten duyarsız eşler).
  const entMap = new Map<string, { value: string; top: number; count: number }>();
  for (const e of entities) {
    const k = e.entity.toLowerCase();
    const c = e._count._all;
    const cur = entMap.get(k);
    if (!cur) entMap.set(k, { value: e.entity, top: c, count: c });
    else {
      cur.count += c;
      if (c > cur.top) {
        cur.top = c;
        cur.value = e.entity;
      }
    }
  }
  const entityItems: FacetItem[] = [...entMap.values()]
    .map((e) => ({ value: e.value, label: entityLabel(e.value), count: e.count }))
    .sort((a, b) => b.count - a.count);

  const actMap = new Map<string, { value: string; top: number; count: number }>();
  for (const a of actions) {
    const k = a.action.toLowerCase();
    const c = a._count._all;
    const cur = actMap.get(k);
    if (!cur) actMap.set(k, { value: a.action, top: c, count: c });
    else {
      cur.count += c;
      if (c > cur.top) {
        cur.top = c;
        cur.value = a.action;
      }
    }
  }
  const actionItems: FacetItem[] = [...actMap.values()]
    .map((a) => ({ value: a.value, label: actionLabel(a.value, ''), count: a.count }))
    .map((a) => ({ ...a, label: a.label.startsWith(' · ') ? a.value : a.label }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 150);

  const ids = actors.map((a) => a.userId).filter((v): v is string => !!v);
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true, role: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const actorItems: ActorFacet[] = actors
    .filter((a) => a.userId && byId.has(a.userId))
    .map((a) => {
      const u = byId.get(a.userId as string)!;
      const count = typeof a._count === 'object' && a._count ? ((a._count as { _all?: number })._all ?? 0) : 0;
      return { userId: u.id, email: u.email, name: u.name, role: u.role ? String(u.role) : null, count };
    });

  return { windowDays: FACET_WINDOW_DAYS, entities: entityItems, actions: actionItems, actors: actorItems };
}

/** Facet'ler 5 dk önbellekli (Redis yoksa doğrudan hesap). */
export function getFacets(db: Db): Promise<AuditFacets> {
  return cachedJson('admin:audit:facets:v1', 300, () => computeFacets(db));
}

export async function getSummary(db: Db, now: Date = new Date()): Promise<AuditSummary> {
  const d1 = new Date(now.getTime() - DAY_MS);
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const [last24h, critical24h, last7d, total, deletedActor, oldest] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { gte: d1 } } }),
    db.auditLog.count({ where: { AND: [{ createdAt: { gte: d1 } }, severityWhere('critical')] } }),
    db.auditLog.count({ where: { createdAt: { gte: d7 } } }),
    db.auditLog.count(),
    db.auditLog.count({ where: { actorType: 'user', userId: null } }),
    db.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  return { last24h, critical24h, last7d, total, deletedActor, oldestAt: oldest?.createdAt.toISOString() ?? null };
}

// ───────────────────────────── Gizli değer maskeleme + fark ─────────────────────────────

const SECRET_PARTS = [
  'password',
  'passwd',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'credential',
  'answer',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authtoken',
  'auth_token',
  'smtppass',
  'smtp_pass',
  'otp',
];

export function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SECRET_PARTS.some((p) => k.includes(p))) return true;
  return /token$/i.test(key) || /hash$/i.test(key) || isProtectedSettingKey(key);
}

export const MASK = '••••••';

/** Gizli anahtarların değerini maskeler (derin). `whole` → değerin tamamı gizli. */
export function redactJson(value: unknown, whole = false): { value: unknown; count: number } {
  let count = 0;
  const walk = (v: unknown, secret: boolean): unknown => {
    if (v === null || v === undefined) return v;
    if (secret) {
      count += 1;
      return MASK;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, false));
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x, isSecretKey(k));
      return out;
    }
    return v;
  };
  return { value: walk(value, whole), count };
}

function show(v: unknown): string | null {
  if (v === undefined) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > VALUE_CAP ? `${s.slice(0, VALUE_CAP)}…` : s;
}

function flatten(v: unknown, prefix: string, depth: number, out: Map<string, { value: unknown; secret: boolean }>, secret: boolean) {
  const o = obj(v);
  if (o && depth < 4 && !secret && Object.keys(o).length > 0) {
    for (const [k, x] of Object.entries(o)) flatten(x, prefix ? `${prefix}.${k}` : k, depth + 1, out, isSecretKey(k));
    return;
  }
  out.set(prefix || '(değer)', { value: v, secret });
}

/** Alan bazlı fark: değişen/eklenen/kaldırılan önce, aynılar sonda. Gizli alanlar maskeli. */
export function diffJson(before: unknown, after: unknown, whole = false): { rows: DiffRow[]; truncated: boolean } {
  const a = new Map<string, { value: unknown; secret: boolean }>();
  const b = new Map<string, { value: unknown; secret: boolean }>();
  if (before !== null && before !== undefined) flatten(before, '', 0, a, whole);
  if (after !== null && after !== undefined) flatten(after, '', 0, b, whole);
  const paths = [...new Set([...a.keys(), ...b.keys()])];
  const rows: DiffRow[] = paths.map((path) => {
    const x = a.get(path);
    const y = b.get(path);
    const secret = !!(x?.secret || y?.secret);
    const change: DiffRow['change'] = !x ? 'added' : !y ? 'removed' : JSON.stringify(x.value) === JSON.stringify(y.value) ? 'same' : 'changed';
    const mask = (e: typeof x) => (e === undefined ? null : secret ? (e.value === null ? 'null' : MASK) : show(e.value));
    return { path, before: mask(x), after: mask(y), change, secret };
  });
  const order: Record<DiffRow['change'], number> = { changed: 0, added: 1, removed: 2, same: 3 };
  rows.sort((p, q) => order[p.change] - order[q.change] || p.path.localeCompare(q.path, 'tr'));
  return { rows: rows.slice(0, DIFF_ROW_CAP), truncated: rows.length > DIFF_ROW_CAP };
}

/** Basit kullanıcı ajanı özeti: "Chrome · Windows". */
export function deviceOf(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|axios|undici|python/i.test(ua)
              ? 'Betik/istemci'
              : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Bilinmeyen cihaz';
}

// ───────────────────────────── Detay ─────────────────────────────

export function revertFor(
  entry: { entity: string; entityId: string | null; action: string; oldData: unknown },
  settingKey: string | null
): { kind: RevertKind; endpoint: string } | null {
  // Mevcut geri alma uçları yalnız `entity === 'settings'` (küçük harf) kayıtlarını kabul eder.
  if (entry.entity !== 'settings') return null;
  const old = obj(entry.oldData);
  if (!old) return null;
  if (settingKey === SEO_SETTINGS_KEY) return obj(old.global) ? { kind: 'seo', endpoint: '/api/admin/seo/rollback' } : null;
  // Ayar geri alma ucu oldData'yı {anahtar: değer} haritası sayar → yalnız toplu kayıt/geri alma satırları uygun.
  if (entry.entityId) return null;
  if (entry.action !== 'batch_update' && entry.action !== 'rollback') return null;
  return Object.keys(old).some((k) => !isProtectedSettingKey(k)) ? { kind: 'settings', endpoint: '/api/admin/settings/rollback' } : null;
}

export async function getAuditDetail(db: Db, id: string): Promise<AuditDetail> {
  const r = await db.auditLog.findUnique({
    where: { id },
    select: { ...ROW_SELECT, oldData: true, newData: true, ipAddress: true, userAgent: true },
  });
  if (!r) throw new ApiError('NOT_FOUND', 'Denetim kaydı bulunamadı.');

  let settingKey: string | null = null;
  if (entityKey(r.entity) === 'settings' && r.entityId) {
    const s = await db.settings.findUnique({ where: { id: r.entityId }, select: { key: true } }).catch(() => null);
    settingKey = s?.key ?? null;
  }
  // Tekil ayar kaydında oldData/newData ayarın DEĞERİNİN kendisi: anahtar gizliyse tamamı maskelenir.
  const whole = !!settingKey && isSecretKey(settingKey);
  const oldR = redactJson(r.oldData, whole);
  const newR = redactJson(r.newData, whole);
  const { rows, truncated } = diffJson(r.oldData, r.newData, whole);

  const related =
    r.entityId != null
      ? await db.auditLog.findMany({
          where: { entity: { equals: r.entity, mode: 'insensitive' }, entityId: r.entityId, id: { not: r.id } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 10,
          select: ROW_SELECT,
        })
      : [];

  return {
    ...toRow(r),
    ip: maskIpAddress(r.ipAddress),
    device: deviceOf(r.userAgent),
    userAgent: r.userAgent ? r.userAgent.slice(0, 300) : null,
    diff: rows,
    diffTruncated: truncated,
    oldData: oldR.value ?? null,
    newData: newR.value ?? null,
    redactedCount: oldR.count + newR.count,
    entityHref: entityHref(r.entity, r.entityId),
    revert: revertFor(r, settingKey),
    related: related.map((x) => {
      const row = toRow(x);
      return { id: row.id, at: row.at, label: row.label, severity: row.severity, actorLabel: actorDisplay(row.actor) };
    }),
  };
}

// ───────────────────────────── Dışa aktarma ─────────────────────────────

/** CSV hücresi: tırnak kaçışı + formül enjeksiyonu koruması. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_DATE = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Süzgece uyan kayıtların özet CSV'si (veri gövdesi YOK — gizli değer sızmaz; IP maskeli).
 * Dışa aktarmanın kendisi de denetim kaydı üretir.
 */
export async function exportAuditCsv(
  db: Db,
  q: AuditListQuery,
  actor: WriterActor,
  request?: { headers: { get(name: string): string | null } } | null,
  now: Date = new Date()
): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const where = buildWhere(q, now);
  const dir: 'asc' | 'desc' = q.siralama === 'eski' ? 'asc' : 'desc';
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: dir }, { id: dir }],
    take: EXPORT_CAP + 1,
    select: { ...ROW_SELECT, ipAddress: true },
  });
  const truncated = rows.length > EXPORT_CAP;
  const kept = rows.slice(0, EXPORT_CAP);
  const header = ['Kayıt No', 'Zaman (İstanbul)', 'Aktör', 'Aktör e-posta', 'Aktör rolü', 'Aktör türü', 'Eylem', 'Eylem kodu', 'Kategori', 'Önem', 'Varlık', 'Varlık kodu', 'Varlık kimliği', 'IP (maskeli)'];
  const lines = kept.map((r) => {
    const row = toRow(r);
    const a = row.actor;
    return [
      row.id,
      CSV_DATE.format(r.createdAt),
      actorDisplay(a),
      a.email ?? '',
      a.role ? (ROLE_LABEL[a.role] ?? a.role) : '',
      ACTOR_KIND_LABEL[a.kind],
      row.label,
      row.action,
      CATEGORY_LABEL[row.category],
      SEVERITY_LABEL[row.severity],
      row.entityLabel,
      row.entity,
      row.entityId ?? '',
      maskIpAddress(r.ipAddress) ?? '',
    ]
      .map(csvCell)
      .join(';');
  });

  const filters = Object.fromEntries(Object.entries(q).filter(([k, v]) => k !== 'cursor' && k !== 'limit' && v !== undefined));
  await db.auditLog.create({
    data: auditEntry(actor, { action: 'AUDIT_EXPORT', entity: 'AuditLog', newData: { filters, rows: kept.length, truncated } }, request),
  });

  return { csv: `﻿${[header.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`, rows: kept.length, truncated };
}

