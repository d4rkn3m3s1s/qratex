/**
 * Güven Merkezi (/admin/trust) sunucu mantığı — vaka kuyruğu, sinyal taraması, aksiyonlar, kurallar.
 *
 * İlkeler: sayıları sunucu hesaplar (sahte veri yok); puan yalnız lib/economy üzerinden geri alınır
 * (`adjustPointsByAdmin` negatif düzeltme → `debitPoints`, tek-kez anahtarı `trust-reverse:<ledgerId>`);
 * askıya alma admin-users `setSuspension` ile (oturum düşürme + denetim); her yazma AuditLog'a gider;
 * silme yok (vakalar çözülür/yeniden açılır). Zaman kovaları Europe/Istanbul.
 */
import { Prisma } from '@prisma/client';
import { VELOCITY_EXEMPT_CATEGORIES, VELOCITY_GAME_BUCKET_LIMIT, VELOCITY_GAME_CATEGORIES } from '@/lib/points-velocity';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry } from '@/lib/data-safety/audit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { adjustPointsByAdmin, isEconomyError } from '@/lib/economy';
import { InsufficientPointsError } from '@/lib/points-wallet';
import { setSuspension, type ActionCtx } from '@/lib/admin-users/actions.server';
import {
  AUDIT_ACTION_LABEL,
  CASE_SEVERITIES,
  RULE_KEYS,
  RULE_TYPE,
  SENSITIVE_AUDIT_ACTIONS,
  caseTypeLabel,
  encodeResolution,
  normalizeFraudStatus,
  normalizeSeverity,
  parseResolution,
  type AlertItem,
  type AuditRow,
  type CaseActionInput,
  type CaseDetail,
  type CaseListItem,
  type CaseListParams,
  type CaseSeverity,
  type CaseSubject,
  type LedgerRow,
  type Paged,
  type ResolutionCode,
  type RuleKey,
  type RulesState,
  type ScanSummary,
  type SubjectActionInput,
  type SubjectProfile,
  type TrustOverview,
  type TrustRules,
} from './contract';
import {
  dedupeCandidates,
  dedupeKeyFor,
  normalizeRules,
  rapidConsumptionCandidates,
  sharedIpCandidates,
  velocityCandidates,
} from './rules';

export const RULES_SETTING_KEY = 'trust.rules.v1';
export const SCAN_SETTING_KEY = 'trust.scan.last';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const LOCAL_DAY = (col: Prisma.Sql) => Prisma.sql`to_char(((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD')`;

const istanbulDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Ham önem değerlerini (eski küçük harf dahil) eşleyen SQL listesi. */
function severityVariants(list: readonly CaseSeverity[]): string[] {
  return list.flatMap((s) => [s, s.toLowerCase()]);
}

const reverseKey = (ledgerId: string) => `trust-reverse:${ledgerId}`;

// ───────────────────────────── Yardımcılar ─────────────────────────────

type ActivityRow = Prisma.SuspiciousActivityGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true; role: true; fraudStatus: true; suspendedAt: true } };
    dealer: { select: { id: true; name: true; businessName: true } };
  };
}>;

const ACTIVITY_INCLUDE = {
  user: { select: { id: true, name: true, email: true, role: true, fraudStatus: true, suspendedAt: true } },
  dealer: { select: { id: true, name: true, businessName: true } },
} as const;

function metaRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function subjectOf(row: Pick<ActivityRow, 'user' | 'metadata' | 'ipAddress'>): CaseSubject {
  if (row.user) {
    return {
      kind: 'user',
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: String(row.user.role),
      fraudStatus: normalizeFraudStatus(row.user.fraudStatus),
      suspended: Boolean(row.user.suspendedAt),
    };
  }
  const identifier = metaRecord(row.metadata).identifier;
  if (typeof identifier === 'string' && identifier.trim()) return { kind: 'identifier', value: identifier.trim().slice(0, 200) };
  if (row.ipAddress) return { kind: 'ip', value: row.ipAddress };
  return { kind: 'none' };
}

export function toListItem(row: ActivityRow): CaseListItem {
  const res = parseResolution(row.resolution);
  return {
    id: row.id,
    type: row.type,
    typeLabel: caseTypeLabel(row.type),
    severity: normalizeSeverity(row.severity),
    description: row.description,
    subject: subjectOf(row),
    dealer: row.dealer ? { id: row.dealer.id, name: row.dealer.businessName ?? row.dealer.name } : null,
    ipAddress: row.ipAddress,
    isResolved: row.isResolved,
    resolutionCode: row.isResolved ? res.code : null,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

function windowStart(window: '24h' | '7d' | '30d' | 'all', now = Date.now()): Date | null {
  if (window === '24h') return new Date(now - DAY);
  if (window === '7d') return new Date(now - 7 * DAY);
  if (window === '30d') return new Date(now - 30 * DAY);
  return null;
}

export function buildCaseWhere(p: CaseListParams, now = Date.now()): Prisma.SuspiciousActivityWhereInput {
  const and: Prisma.SuspiciousActivityWhereInput[] = [];
  if (p.status === 'open') and.push({ isResolved: false });
  if (p.status === 'resolved') and.push({ isResolved: true });
  if (p.severity.length) and.push({ severity: { in: severityVariants(p.severity) } });
  if (p.type) and.push({ type: { equals: p.type, mode: 'insensitive' } });
  const since = windowStart(p.window, now);
  if (since) and.push({ createdAt: { gte: since } });
  if (p.q) {
    const q = p.q;
    and.push({
      OR: [
        { description: { contains: q, mode: 'insensitive' } },
        { ipAddress: { contains: q } },
        { id: q },
        { user: { is: { email: { contains: q, mode: 'insensitive' } } } },
        { user: { is: { name: { contains: q, mode: 'insensitive' } } } },
        { dealer: { is: { businessName: { contains: q, mode: 'insensitive' } } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

function actorOf(row: { userId: string | null; actorSnapshot: unknown; user?: { name: string | null; email: string | null; role: unknown } | null }) {
  const snap = metaRecord(row.actorSnapshot);
  return {
    id: row.userId,
    name: (row.user?.name ?? (typeof snap.name === 'string' ? snap.name : null)) || null,
    email: (row.user?.email ?? (typeof snap.email === 'string' ? snap.email : null)) || null,
    role: row.user?.role ? String(row.user.role) : typeof snap.role === 'string' ? snap.role : null,
  };
}

function toAuditRow(row: {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  actorSnapshot: unknown;
  ipAddress: string | null;
  newData: unknown;
  createdAt: Date;
  user?: { name: string | null; email: string | null; role: unknown } | null;
}): AuditRow {
  return {
    id: row.id,
    action: row.action,
    actionLabel: AUDIT_ACTION_LABEL[row.action] ?? row.action,
    entity: row.entity,
    entityId: row.entityId,
    actor: actorOf(row),
    ipAddress: row.ipAddress,
    newData: row.newData ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ───────────────────────────── Kurallar ─────────────────────────────

export async function loadRules(): Promise<{ rules: TrustRules; version: string | null; isDefault: boolean }> {
  const row = await prisma.settings.findUnique({ where: { key: RULES_SETTING_KEY } });
  if (!row) return { ...normalizeRules(null), version: null };
  return { ...normalizeRules(row.value), version: row.updatedAt.toISOString() };
}

export async function getRulesState(): Promise<RulesState> {
  const { rules, version, isDefault } = await loadRules();
  const since = new Date(Date.now() - 30 * DAY);
  const types = RULE_KEYS.map((k) => RULE_TYPE[k]);
  const [triggered, resolved, falsePos, open] = await Promise.all([
    prisma.suspiciousActivity.groupBy({ by: ['type'], where: { type: { in: types }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.suspiciousActivity.groupBy({ by: ['type'], where: { type: { in: types }, createdAt: { gte: since }, isResolved: true }, _count: { _all: true } }),
    prisma.suspiciousActivity.groupBy({
      by: ['type'],
      where: { type: { in: types }, createdAt: { gte: since }, isResolved: true, resolution: { startsWith: 'false_positive' } },
      _count: { _all: true },
    }),
    prisma.suspiciousActivity.groupBy({ by: ['type'], where: { type: { in: types }, isResolved: false }, _count: { _all: true } }),
  ]);
  const pick = (rows: { type: string; _count: { _all: number } }[], t: string) => rows.find((r) => r.type === t)?._count._all ?? 0;
  const stats = Object.fromEntries(
    RULE_KEYS.map((k) => [
      k,
      {
        triggered30d: pick(triggered, RULE_TYPE[k]),
        resolved30d: pick(resolved, RULE_TYPE[k]),
        falsePositive30d: pick(falsePos, RULE_TYPE[k]),
        open: pick(open, RULE_TYPE[k]),
      },
    ]),
  ) as RulesState['stats'];
  return { rules, version, isDefault, stats };
}

export async function updateRules(ctx: ActionCtx, input: { rules: TrustRules; baseVersion: string | null; reason: string }): Promise<RulesState> {
  const current = await prisma.settings.findUnique({ where: { key: RULES_SETTING_KEY } });
  const currentVersion = current ? current.updatedAt.toISOString() : null;
  if (currentVersion !== input.baseVersion) {
    throw new ApiError('CONFLICT', 'Kurallar siz düzenlerken başka bir yönetici tarafından değiştirildi. Güncel hâli yükleyip tekrar deneyin.', {
      status: 409,
    });
  }
  const value = input.rules as unknown as Prisma.InputJsonValue;
  await prisma.$transaction(async (tx) => {
    if (current) {
      const w = await tx.settings.updateMany({ where: { key: RULES_SETTING_KEY, updatedAt: current.updatedAt }, data: { value } });
      if (w.count === 0) throw new ApiError('CONFLICT', 'Kurallar aynı anda değiştirildi. Güncel hâli yükleyip tekrar deneyin.', { status: 409 });
    } else {
      await tx.settings.create({ data: { key: RULES_SETTING_KEY, value, category: 'trust' } });
    }
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: 'TRUST_RULES_UPDATE',
          entity: 'Settings',
          entityId: RULES_SETTING_KEY,
          oldData: current ? (current.value as unknown) : null,
          newData: { rules: input.rules, reason: input.reason },
        },
        ctx.request,
      ),
    });
  });
  return getRulesState();
}

// ───────────────────────────── Sinyal taraması ─────────────────────────────

async function readScanSummary(): Promise<ScanSummary | null> {
  const row = await prisma.settings.findUnique({ where: { key: SCAN_SETTING_KEY } });
  const v = metaRecord(row?.value);
  if (typeof v.at !== 'string') return null;
  return v as unknown as ScanSummary;
}

/**
 * Kuralları gerçek veriye uygular ve tekilleştirilmiş vakaları `SuspiciousActivity` olarak yazar.
 * Kullanıcı durumuna DOKUNMAZ (otomatik ceza yok); karar operatörün.
 */
export async function runScan(ctx: ActionCtx, now = new Date()): Promise<ScanSummary> {
  const { rules } = await loadRules();
  const t = now.getTime();

  const [velocityRows, consumptionRows, ipRows] = await Promise.all([
    rules.velocity.enabled
      ? // Kategori ayrımı lib/points-velocity ile TEK tanım: tek seferlik ödüller (rozet, davet,
        // görev, turnuva …) ve iade/transferler sayılmaz; oyun kendi tavanıyla ayrı kovada
        // (yalnız 2 × günlük oyun tavanını aşarsa). Eskiden karakter rozeti açan her dürüst
        // müşteri (2.500–10.000 tek seferlik) YÜKSEK önemli "puan hızı" vakası üretiyordu.
        prisma.$queryRaw<{ userId: string; total: number }[]>(Prisma.sql`
          SELECT "userId",
                 CASE WHEN v."general" >= ${rules.velocity.points} THEN v."general" ELSE v."game" END AS "total"
          FROM (
            SELECT ae."userId" AS "userId",
                   SUM(CASE WHEN ae."category" IN (${Prisma.join([...VELOCITY_EXEMPT_CATEGORIES, ...VELOCITY_GAME_CATEGORIES])}) THEN 0
                            WHEN jsonb_typeof(ae."data"->'points') = 'number' THEN (ae."data"->>'points')::numeric ELSE 0 END)::float8 AS "general",
                   SUM(CASE WHEN ae."category" IN (${Prisma.join([...VELOCITY_GAME_CATEGORIES])})
                             AND jsonb_typeof(ae."data"->'points') = 'number' THEN (ae."data"->>'points')::numeric ELSE 0 END)::float8 AS "game"
            FROM "AnalyticsEvent" ae
            JOIN "User" u ON u."id" = ae."userId"
            WHERE ae."event" = 'points_credited'
              AND ae."createdAt" >= ${new Date(t - rules.velocity.windowHours * HOUR)}
              AND u."role"::text <> 'ADMIN' AND u."isDemo" = false
            GROUP BY ae."userId"
          ) v
          WHERE v."general" >= ${rules.velocity.points} OR v."game" > ${VELOCITY_GAME_BUCKET_LIMIT}
          ORDER BY GREATEST(v."general", v."game") DESC
          LIMIT 200`)
      : Promise.resolve([]),
    rules.rapidConsumption.enabled
      ? prisma.$queryRaw<{ userId: string; count: number; dealers: number }[]>(Prisma.sql`
          SELECT c."customerId" AS "userId", COUNT(*)::int AS "count", COUNT(DISTINCT c."dealerId")::int AS "dealers"
          FROM "Consumption" c
          JOIN "User" u ON u."id" = c."customerId"
          WHERE c."createdAt" >= ${new Date(t - rules.rapidConsumption.windowMinutes * 60_000)}
            AND u."isDemo" = false
          GROUP BY c."customerId"
          HAVING COUNT(*) >= ${rules.rapidConsumption.count}
          ORDER BY 2 DESC
          LIMIT 200`)
      : Promise.resolve([]),
    rules.sharedIp.enabled
      ? prisma.$queryRaw<{ ip: string; userIds: string[] }[]>(Prisma.sql`
          SELECT a."ipAddress" AS "ip", array_agg(DISTINCT a."userId") AS "userIds"
          FROM "AuditLog" a
          JOIN "User" u ON u."id" = a."userId"
          WHERE a."ipAddress" IS NOT NULL
            AND a."createdAt" >= ${new Date(t - rules.sharedIp.windowDays * DAY)}
            AND u."role"::text = 'CUSTOMER' AND u."isDemo" = false
          GROUP BY a."ipAddress"
          HAVING COUNT(DISTINCT a."userId") >= ${rules.sharedIp.accounts}
          LIMIT 100`)
      : Promise.resolve([]),
  ]);

  const candidates = [
    ...velocityCandidates(velocityRows.map((r) => ({ userId: r.userId, total: Number(r.total) })), rules.velocity),
    ...rapidConsumptionCandidates(consumptionRows.map((r) => ({ ...r, count: Number(r.count), dealers: Number(r.dealers) })), rules.rapidConsumption),
    ...sharedIpCandidates(ipRows, rules.sharedIp),
  ];

  // Tekilleştirme: aynı tür+özne için açık vaka ya da kuralın penceresi içinde çözülmüş vaka varsa yeni vaka yok
  // (yanlış alarm olarak kapatılan sinyal hemen geri gelmesin).
  const longestWindow = Math.max(rules.velocity.windowHours * HOUR, rules.rapidConsumption.windowMinutes * 60_000, rules.sharedIp.windowDays * DAY);
  const existing = candidates.length
    ? await prisma.suspiciousActivity.findMany({
        where: {
          type: { in: Object.values(RULE_TYPE) },
          OR: [{ isResolved: false }, { resolvedAt: { gte: new Date(t - longestWindow) } }],
        },
        select: { type: true, userId: true, ipAddress: true, isResolved: true, resolvedAt: true },
        take: 5000,
      })
    : [];
  const windowFor: Record<string, number> = {
    [RULE_TYPE.velocity]: rules.velocity.windowHours * HOUR,
    [RULE_TYPE.rapidConsumption]: rules.rapidConsumption.windowMinutes * 60_000,
    [RULE_TYPE.sharedIp]: rules.sharedIp.windowDays * DAY,
  };
  const keys = new Set(
    existing
      .filter((e) => !e.isResolved || (e.resolvedAt && e.resolvedAt.getTime() >= t - (windowFor[e.type] ?? 0)))
      .map((e) => dedupeKeyFor(e.type, e.userId, e.ipAddress)),
  );
  const fresh = dedupeCandidates(candidates, keys);

  const byRule = Object.fromEntries(
    RULE_KEYS.map((k) => [k, { enabled: rules[k].enabled, candidates: candidates.filter((c) => c.rule === k).length, created: fresh.filter((c) => c.rule === k).length }]),
  ) as ScanSummary['byRule'];
  const summary: ScanSummary = { at: now.toISOString(), by: ctx.actor.id, created: fresh.length, byRule };

  await prisma.$transaction(async (tx) => {
    if (fresh.length) {
      await tx.suspiciousActivity.createMany({
        data: fresh.map((c) => ({
          userId: c.userId,
          ipAddress: c.ipAddress,
          type: c.type,
          severity: c.severity,
          description: c.description,
          metadata: c.metadata as Prisma.InputJsonValue,
        })),
      });
    }
    await tx.settings.upsert({
      where: { key: SCAN_SETTING_KEY },
      create: { key: SCAN_SETTING_KEY, value: summary as unknown as Prisma.InputJsonValue, category: 'trust' },
      update: { value: summary as unknown as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'TRUST_SCAN', entity: 'SuspiciousActivity', newData: summary }, ctx.request),
    });
  });
  return summary;
}

// ───────────────────────────── Genel bakış ─────────────────────────────

export async function getOverview(now = new Date()): Promise<TrustOverview> {
  const t = now.getTime();
  const since24 = new Date(t - DAY);
  const since14 = new Date(t - 14 * DAY);
  const [openGroups, new24, series, alerts24, alertsUnread, alertsCritical, statusGroups, suspended, voided, reversed, sensitive24, lastScan, rulesLoaded] =
    await Promise.all([
      prisma.suspiciousActivity.groupBy({ by: ['severity'], where: { isResolved: false }, _count: { _all: true } }),
      prisma.suspiciousActivity.count({ where: { createdAt: { gte: since24 } } }),
      prisma.$queryRaw<{ day: string; count: number }[]>(Prisma.sql`
        SELECT ${LOCAL_DAY(Prisma.sql`"createdAt"`)} AS "day", COUNT(*)::int AS "count"
        FROM "SuspiciousActivity" WHERE "createdAt" >= ${since14} GROUP BY 1 ORDER BY 1`),
      // Önem sözlüğü fark etmeksizin INFO dışı her uyarı (HIGH dahil — eski sayaç HIGH'ı dışlıyordu).
      prisma.securityAlert.count({ where: { createdAt: { gte: since24 }, NOT: { severity: { in: ['INFO', 'info', 'LOW', 'low'] } } } }),
      prisma.securityAlert.count({ where: { isRead: false, isResolved: false } }),
      prisma.securityAlert.count({ where: { isResolved: false, severity: { in: ['CRITICAL', 'critical'] } } }),
      prisma.user.groupBy({ by: ['role', 'fraudStatus'], where: { fraudStatus: { in: ['flagged', 'shadow_ban'] } }, _count: { _all: true } }),
      prisma.user.count({ where: { suspendedAt: { not: null }, anonymizedAt: null } }),
      prisma.pointsLedger.aggregate({ where: { status: 'void', createdAt: { gte: new Date(t - 7 * DAY) } }, _sum: { delta: true } }),
      prisma.pointsLedger.aggregate({ where: { idempotencyKey: { startsWith: 'trust-reverse:' }, createdAt: { gte: new Date(t - 30 * DAY) } }, _sum: { delta: true } }),
      prisma.auditLog.count({ where: { createdAt: { gte: since24 }, action: { in: [...SENSITIVE_AUDIT_ACTIONS] } } }),
      readScanSummary(),
      loadRules(),
    ]);

  const bySeverity = Object.fromEntries(CASE_SEVERITIES.map((s) => [s, 0])) as Record<CaseSeverity, number>;
  for (const g of openGroups) bySeverity[normalizeSeverity(g.severity)] += g._count._all;
  const total = Object.values(bySeverity).reduce((a, b) => a + b, 0);

  const seriesMap = new Map(series.map((r) => [r.day, Number(r.count)]));
  const caseSeries = Array.from({ length: 14 }, (_, i) => {
    const day = istanbulDay(new Date(t - (13 - i) * DAY));
    return { day, count: seriesMap.get(day) ?? 0 };
  });

  const empty = () => ({ customer: 0, dealer: 0, other: 0 });
  const flagged = empty();
  const shadowBan = empty();
  for (const g of statusGroups) {
    const bucket = g.fraudStatus === 'shadow_ban' ? shadowBan : flagged;
    const role = String(g.role);
    const k = role === 'CUSTOMER' ? 'customer' : role === 'DEALER' ? 'dealer' : 'other';
    bucket[k] += g._count._all;
  }

  return {
    generatedAt: now.toISOString(),
    openCases: { total, bySeverity },
    newCases24h: new24,
    caseSeries,
    alerts: { last24h: alerts24, unread: alertsUnread, criticalOpen: alertsCritical },
    accounts: { flagged, shadowBan, suspended },
    voidedPoints7d: Math.abs(voided._sum.delta ?? 0),
    reversedPoints30d: Math.abs(reversed._sum.delta ?? 0),
    sensitiveActions24h: sensitive24,
    lastScan,
    rulesEnabled: RULE_KEYS.filter((k) => rulesLoaded.rules[k].enabled).length,
  };
}

// ───────────────────────────── Vaka kuyruğu ─────────────────────────────

export async function listCases(p: CaseListParams): Promise<Paged<CaseListItem>> {
  const where = buildCaseWhere(p);
  const [total, rows] = await Promise.all([
    prisma.suspiciousActivity.count({ where }),
    prisma.suspiciousActivity.findMany({
      where,
      include: ACTIVITY_INCLUDE,
      orderBy: [{ createdAt: p.sort === 'createdAt.asc' ? 'asc' : 'desc' }, { id: 'asc' }],
      skip: (p.page - 1) * p.size,
      take: p.size,
    }),
  ]);
  return { items: rows.map(toListItem), total, page: p.page, size: p.size };
}

/**
 * CSV dışa aktarım (en çok 5000 satır, UTF-8 BOM, İstanbul saati). Dosya kişisel veri (e-posta,
 * IP) taşır → her dışa aktarım kim/hangi filtre/kaç satır olarak denetime yazılır (KVKK 5651
 * dışa aktarımıyla aynı kural).
 */
export async function exportCasesCsv(ctx: ActionCtx, p: CaseListParams): Promise<string> {
  const rows = await prisma.suspiciousActivity.findMany({
    where: buildCaseWhere(p),
    include: ACTIVITY_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 5000,
  });
  const fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'medium' });
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // CSV enjeksiyonu: formül gibi başlayan hücreleri metne zorla.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['Vaka', 'Oluşturma', 'Tür', 'Önem', 'Durum', 'Özne', 'Bayi', 'IP', 'Açıklama', 'Çözüm', 'Çözüm zamanı'];
  const lines = rows.map((r) => {
    const item = toListItem(r);
    const subj =
      item.subject.kind === 'user'
        ? item.subject.email ?? item.subject.id
        : item.subject.kind === 'identifier' || item.subject.kind === 'ip'
          ? item.subject.value
          : '';
    return [
      item.id,
      fmt.format(r.createdAt),
      item.typeLabel,
      item.severity,
      item.isResolved ? 'Çözüldü' : 'Açık',
      subj,
      item.dealer?.name ?? '',
      item.ipAddress ?? '',
      item.description,
      r.resolution ?? '',
      r.resolvedAt ? fmt.format(r.resolvedAt) : '',
    ]
      .map(esc)
      .join(',');
  });
  await prisma.auditLog.create({
    data: auditEntry(
      ctx.actor,
      {
        action: 'TRUST_CASES_EXPORT',
        entity: 'SuspiciousActivity',
        newData: {
          filters: { status: p.status, severity: p.severity, type: p.type ?? null, window: p.window, q: p.q ?? null },
          rows: rows.length,
          truncated: rows.length >= 5000,
        },
      },
      ctx.request,
    ),
  });
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

async function loadSubjectUserId(row: ActivityRow): Promise<string | null> {
  if (row.userId) return row.userId;
  const identifier = metaRecord(row.metadata).identifier;
  if (typeof identifier === 'string' && identifier.includes('@')) {
    const u = await prisma.user.findFirst({ where: { email: { equals: identifier.trim(), mode: 'insensitive' } }, select: { id: true } });
    return u?.id ?? null;
  }
  return null;
}

async function loadProfile(userId: string, now = Date.now()): Promise<SubjectProfile | null> {
  const since24 = new Date(now - DAY);
  const [u, pts, cons, open] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        points: true,
        fraudStatus: true,
        fraudScore: true,
        trustScore: true,
        trustTier: true,
        suspendedAt: true,
        suspendedReason: true,
        anonymizedAt: true,
        isDemo: true,
        createdAt: true,
      },
    }),
    prisma.$queryRaw<{ total: number | null }[]>(Prisma.sql`
      SELECT SUM(CASE WHEN jsonb_typeof("data"->'points') = 'number' THEN ("data"->>'points')::numeric ELSE 0 END)::float8 AS "total"
      FROM "AnalyticsEvent" WHERE "userId" = ${userId} AND "event" = 'points_credited' AND "createdAt" >= ${since24}`),
    prisma.consumption.count({ where: { customerId: userId, createdAt: { gte: since24 } } }),
    prisma.suspiciousActivity.count({ where: { userId, isResolved: false } }),
  ]);
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: String(u.role),
    points: u.points,
    fraudStatus: normalizeFraudStatus(u.fraudStatus),
    fraudScore: u.fraudScore ?? null,
    trustScore: u.trustScore,
    trustTier: u.trustTier,
    suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
    suspendedReason: u.suspendedReason,
    anonymized: Boolean(u.anonymizedAt),
    isDemo: u.isDemo,
    createdAt: u.createdAt.toISOString(),
    points24h: Math.round(Number(pts[0]?.total ?? 0)),
    consumptions24h: cons,
    openCases: open,
  };
}

async function loadLedger(userId: string): Promise<LedgerRow[]> {
  const rows = await prisma.pointsLedger.findMany({
    where: { userId, currency: 'POINTS' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 25,
    select: { id: true, delta: true, source: true, status: true, reason: true, createdAt: true },
  });
  const keys = rows.filter((r) => r.delta > 0).map((r) => reverseKey(r.id));
  const reversed = keys.length
    ? await prisma.pointsLedger.findMany({ where: { idempotencyKey: { in: keys } }, select: { idempotencyKey: true } })
    : [];
  const done = new Set(reversed.map((r) => r.idempotencyKey));
  return rows.map((r) => {
    const isReversed = done.has(reverseKey(r.id)) || r.status === 'reversed';
    return {
      id: r.id,
      delta: r.delta,
      source: r.source,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      reversed: isReversed,
      reversible: r.delta > 0 && r.status === 'posted' && !isReversed && !r.source.startsWith('reversal'),
    };
  });
}

export async function getCaseDetail(id: string): Promise<CaseDetail> {
  const row = await prisma.suspiciousActivity.findUnique({ where: { id }, include: ACTIVITY_INCLUDE });
  if (!row) throw new ApiError('NOT_FOUND', 'Vaka bulunamadı.');
  const base = toListItem(row);
  const subjectUserId = await loadSubjectUserId(row);
  const meta = metaRecord(row.metadata);
  const ruleUserIds = Array.isArray(meta.userIds) ? (meta.userIds as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 50) : [];

  const relatedOr: Prisma.SuspiciousActivityWhereInput[] = [];
  if (subjectUserId) relatedOr.push({ userId: subjectUserId });
  if (row.ipAddress) relatedOr.push({ ipAddress: row.ipAddress });

  const [profile, ledger, related, resolver, history, sameIpRaw] = await Promise.all([
    subjectUserId ? loadProfile(subjectUserId) : Promise.resolve(null),
    subjectUserId ? loadLedger(subjectUserId) : Promise.resolve([]),
    relatedOr.length
      ? prisma.suspiciousActivity.findMany({
          where: { id: { not: row.id }, OR: relatedOr },
          include: ACTIVITY_INCLUDE,
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
    row.resolvedBy ? prisma.user.findUnique({ where: { id: row.resolvedBy }, select: { id: true, name: true } }) : Promise.resolve(null),
    prisma.auditLog.findMany({
      where: { OR: [{ entity: 'SuspiciousActivity', entityId: row.id }, ...(subjectUserId ? [{ entity: 'User', entityId: subjectUserId, action: { in: [...SENSITIVE_AUDIT_ACTIONS] } }] : [])] },
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    ruleUserIds.length
      ? Promise.resolve(ruleUserIds)
      : row.ipAddress
        ? prisma.auditLog
            .findMany({
              where: { ipAddress: row.ipAddress, userId: { not: null }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
              distinct: ['userId'],
              select: { userId: true },
              take: 20,
            })
            .then((r) => r.map((x) => x.userId).filter((v): v is string => Boolean(v)))
        : Promise.resolve([] as string[]),
  ]);

  const sameIpIds = sameIpRaw.filter((uid) => uid !== subjectUserId);
  const sameIpUsers = sameIpIds.length
    ? await prisma.user.findMany({ where: { id: { in: sameIpIds } }, select: { id: true, name: true, email: true, role: true, fraudStatus: true }, take: 50 })
    : [];

  const res = parseResolution(row.resolution);
  return {
    ...base,
    metadata: row.metadata ?? null,
    userAgent: row.userAgent,
    cardId: row.cardId,
    resolution: row.isResolved ? { code: res.code, note: res.note, by: resolver ? { id: resolver.id, name: resolver.name } : row.resolvedBy ? { id: row.resolvedBy, name: null } : null } : null,
    profile,
    ledger,
    related: related.map(toListItem),
    sameIpAccounts: sameIpUsers.map((u) => ({ id: u.id, name: u.name, email: u.email, role: String(u.role), fraudStatus: normalizeFraudStatus(u.fraudStatus) })),
    history: history.map(toAuditRow),
  };
}

// ───────────────────────────── Vaka aksiyonları ─────────────────────────────

export async function caseAction(ctx: ActionCtx, id: string, input: CaseActionInput): Promise<CaseDetail> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const w =
      input.action === 'resolve'
        ? await tx.suspiciousActivity.updateMany({
            where: { id, isResolved: false },
            data: { isResolved: true, resolvedAt: now, resolvedBy: ctx.actor.id, resolution: encodeResolution(input.code, input.note) },
          })
        : await tx.suspiciousActivity.updateMany({
            where: { id, isResolved: true },
            data: { isResolved: false, resolvedAt: null, resolvedBy: null, resolution: null },
          });
    if (w.count === 0) {
      const exists = await tx.suspiciousActivity.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new ApiError('NOT_FOUND', 'Vaka bulunamadı.');
      throw new ApiError('CONFLICT', input.action === 'resolve' ? 'Vaka zaten çözülmüş.' : 'Vaka zaten açık.', { status: 409 });
    }
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: input.action === 'resolve' ? 'TRUST_CASE_RESOLVE' : 'TRUST_CASE_REOPEN',
          entity: 'SuspiciousActivity',
          entityId: id,
          newData: input.action === 'resolve' ? { code: input.code, note: input.note } : { note: input.note },
        },
        ctx.request,
      ),
    });
  });
  return getCaseDetail(id);
}

export async function bulkResolve(ctx: ActionCtx, input: { ids: string[]; code: ResolutionCode; note: string }) {
  const ids = Array.from(new Set(input.ids));
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const open = await tx.suspiciousActivity.findMany({ where: { id: { in: ids }, isResolved: false }, select: { id: true } });
    const openIds = open.map((o) => o.id);
    if (openIds.length) {
      await tx.suspiciousActivity.updateMany({
        where: { id: { in: openIds }, isResolved: false },
        data: { isResolved: true, resolvedAt: now, resolvedBy: ctx.actor.id, resolution: encodeResolution(input.code, input.note) },
      });
      await tx.auditLog.create({
        data: auditEntry(
          ctx.actor,
          { action: 'TRUST_CASE_BULK_RESOLVE', entity: 'SuspiciousActivity', newData: { ids: openIds, code: input.code, note: input.note } },
          ctx.request,
        ),
      });
    }
    return { resolved: openIds.length, skipped: ids.length - openIds.length };
  });
}

// ───────────────────────────── Özne aksiyonları ─────────────────────────────

export async function subjectAction(ctx: ActionCtx, userId: string, input: SubjectActionInput): Promise<SubjectProfile> {
  if (userId === ctx.actor.id) throw new ApiError('FORBIDDEN', 'Kendi hesabınız üzerinde güven aksiyonu alamazsınız.');
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, fraudStatus: true, anonymizedAt: true } });
  if (!target) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  if (target.anonymizedAt) throw new ApiError('CONFLICT', 'Anonimleştirilmiş hesapta işlem yapılamaz.', { status: 409 });

  if (input.action === 'fraud_status') {
    if (String(target.role) === 'ADMIN') throw new ApiError('FORBIDDEN', 'Yönetici hesaplarının sahtekârlık durumu değiştirilemez.');
    if (input.status === input.from) throw new ApiError('VALIDATION', 'Yeni durum mevcut durumla aynı.');
    await prisma.$transaction(async (tx) => {
      const w = await tx.user.updateMany({
        where: { id: userId, fraudStatus: input.from, anonymizedAt: null },
        data: { fraudStatus: input.status },
      });
      if (w.count === 0) {
        throw new ApiError('CONFLICT', 'Hesabın durumu siz bakarken değişti. Güncel hâli yükleyip tekrar deneyin.', { status: 409 });
      }
      await tx.auditLog.create({
        data: auditEntry(
          ctx.actor,
          {
            action: 'TRUST_FRAUD_STATUS',
            entity: 'User',
            entityId: userId,
            oldData: { fraudStatus: input.from },
            newData: { fraudStatus: input.status, reason: input.reason, caseId: input.caseId ?? null },
          },
          ctx.request,
        ),
      });
    });
  } else {
    await setSuspension(ctx, userId, { action: input.action, reason: input.reason });
  }
  const profile = await loadProfile(userId);
  if (!profile) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  return profile;
}

/**
 * Defter satırını geri alır: lib/economy `adjustPointsByAdmin` ile negatif düzeltme (debitPoints;
 * eksi bakiye yok). Tek-kez anahtarı `trust-reverse:<ledgerId>` → aynı satır iki kez geri alınamaz.
 */
export async function reverseLedgerEntry(ctx: ActionCtx, ledgerId: string, input: { reason: string; caseId?: string }) {
  const row = await prisma.pointsLedger.findUnique({
    where: { id: ledgerId },
    select: { id: true, userId: true, delta: true, status: true, source: true, currency: true },
  });
  if (!row || !row.userId) throw new ApiError('NOT_FOUND', 'Defter satırı bulunamadı.');
  if (row.currency !== 'POINTS' || row.delta <= 0) throw new ApiError('VALIDATION', 'Yalnız puan kazanımı satırları geri alınabilir.');
  if (row.status !== 'posted') throw new ApiError('CONFLICT', 'Bu satır bakiyeye yansımamış (askıda ya da geçersiz); geri alınacak puan yok.', { status: 409 });
  // UI'daki `reversible` kuralı sunucuda da: iade/geri alma satırı "kazanım" değildir.
  if (row.source.startsWith('reversal')) throw new ApiError('VALIDATION', 'Geri alma satırı yeniden geri alınamaz.');
  if (row.userId === ctx.actor.id) throw new ApiError('FORBIDDEN', 'Kendi puanınızı geri alamazsınız.');
  const already = await prisma.pointsLedger.findUnique({ where: { idempotencyKey: reverseKey(ledgerId) }, select: { id: true } });
  if (already) throw new ApiError('CONFLICT', 'Bu satır daha önce geri alındı.', { status: 409 });

  let result;
  try {
    result = await adjustPointsByAdmin(prisma, {
      adminId: ctx.actor.id,
      userId: row.userId,
      delta: -row.delta,
      reason: `Güven Merkezi geri alma (${row.source}): ${input.reason}`.slice(0, 500),
      idempotencyKey: reverseKey(ledgerId),
      auditMeta: ctx.request ? getAuditRequestMeta(ctx.request) : undefined,
    });
  } catch (e) {
    if (e instanceof InsufficientPointsError) {
      throw new ApiError('INSUFFICIENT_POINTS', 'Kullanıcının bakiyesi bu satırı geri almaya yetmiyor (puanlar harcanmış). Bakiye eksiye düşürülemez.', {
        status: 409,
      });
    }
    if (isEconomyError(e)) throw new ApiError(e.code, e.message, { status: e.httpStatus });
    throw e;
  }
  // Yarışan ikinci istek (çift tık / iki sekme) tek-kez anahtarına çarpar: puan bir kez düşer,
  // denetim de bir kez yazılır; ikinci istek dürüstçe 409 alır.
  if (result.duplicate) throw new ApiError('CONFLICT', 'Bu satır daha önce geri alındı.', { status: 409 });
  await prisma.auditLog.create({
    data: auditEntry(
      ctx.actor,
      {
        action: 'TRUST_LEDGER_REVERSE',
        entity: 'PointsLedger',
        entityId: ledgerId,
        newData: { userId: row.userId, points: row.delta, reason: input.reason, caseId: input.caseId ?? null, reversalLedgerId: result.ledgerId },
      },
      ctx.request,
    ),
  });
  return { reversed: row.delta, balance: result.points, duplicate: result.duplicate };
}

// ───────────────────────────── Güvenlik uyarıları ─────────────────────────────

export async function listAlerts(p: { status: 'open' | 'unread' | 'resolved' | 'all'; page: number; size: number }): Promise<Paged<AlertItem>> {
  const where: Prisma.SecurityAlertWhereInput =
    p.status === 'open' ? { isResolved: false } : p.status === 'unread' ? { isRead: false, isResolved: false } : p.status === 'resolved' ? { isResolved: true } : {};
  const [total, rows] = await Promise.all([
    prisma.securityAlert.count({ where }),
    prisma.securityAlert.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (p.page - 1) * p.size, take: p.size }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      typeLabel: caseTypeLabel(r.type),
      message: r.message,
      severity: normalizeSeverity(r.severity),
      targetId: r.targetId,
      targetType: r.targetType,
      isRead: r.isRead,
      isResolved: r.isResolved,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: p.page,
    size: p.size,
  };
}

export async function alertAction(ctx: ActionCtx, input: { ids: string[]; action: 'read' | 'resolve' | 'reopen' }) {
  const ids = Array.from(new Set(input.ids));
  return prisma.$transaction(async (tx) => {
    const data =
      input.action === 'read' ? { isRead: true } : input.action === 'resolve' ? { isRead: true, isResolved: true } : { isResolved: false };
    const w = await tx.securityAlert.updateMany({ where: { id: { in: ids } }, data });
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'TRUST_ALERTS_UPDATE', entity: 'SecurityAlert', newData: { ids, action: input.action, count: w.count } }, ctx.request),
    });
    return { updated: w.count };
  });
}

// ───────────────────────────── Hassas denetim ─────────────────────────────

export async function listSensitiveAudit(p: { window: '24h' | '7d' | '30d'; page: number; size: number }): Promise<Paged<AuditRow>> {
  const since = windowStart(p.window) ?? new Date(Date.now() - 7 * DAY);
  const where: Prisma.AuditLogWhereInput = { createdAt: { gte: since }, action: { in: [...SENSITIVE_AUDIT_ACTIONS] } };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (p.page - 1) * p.size,
      take: p.size,
    }),
  ]);
  return { items: rows.map(toAuditRow), total, page: p.page, size: p.size };
}

export type { RuleKey };
