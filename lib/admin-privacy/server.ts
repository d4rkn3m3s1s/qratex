/**
 * /admin/privacy (KVKK merkezi) — sunucu okumaları. Her fonksiyon `db` alır (test: sahte istemci).
 *
 * İlke: ölçülmeyen hiçbir şey "uyumlu" görünmez. Kontroller gerçek veriden türetilir; ölçülemeyen
 * kontrol `unknown` döner (sessiz "ok" yok). IP'ler HER ZAMAN maskeli döner.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { CONSENT_VERSION } from '@/lib/consent/types';
import { DSR_LEGAL_DAYS, OPEN_DSR_STATUSES, daysRemaining, effectiveDueAt } from '@/lib/dsr-workflow';
import { PII_REGISTRY, registryKey, retentionEntries } from '@/lib/pii-registry';
import { DEFAULT_RETENTION_DAYS as ANALYTICS_RETENTION_DAYS, retentionWhere } from '@/lib/analytics-event-retention';
import { maskIpAddress } from '@/lib/request-metadata';
import type {
  ComplianceCheck,
  ConsentStats,
  CronJobView,
  DsrSummary,
  LogCoverage,
  LogSource,
  LogsPage,
  LogsQuery,
  PrivacyOverview,
  RetentionView,
  UnifiedLogRow,
} from './contract';

export type Db = PrismaClient | Prisma.TransactionClient;
type Raw = { $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => Promise<T> };

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = 'Europe/Istanbul';

export function percent(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/** İstanbul takvim günü (YYYY-MM-DD). */
export function istanbulDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** İstanbul gününün başlangıcı (UTC Date). Türkiye 2016'dan beri sabit UTC+3. */
export function istanbulDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

// ───────────────────────────── KVKK talepleri özeti ─────────────────────────────

function dueBefore(at: Date): Prisma.DataSubjectRequestWhereInput {
  return {
    OR: [{ dueAt: { lt: at } }, { dueAt: null, createdAt: { lt: new Date(at.getTime() - DSR_LEGAL_DAYS * DAY_MS) } }],
  };
}

export async function getDsrSummary(db: Db, now = new Date()): Promise<DsrSummary> {
  const open = { status: { in: [...OPEN_DSR_STATUSES] } };
  const [openCount, overdue, dueSoon, completed30, nearest] = await Promise.all([
    db.dataSubjectRequest.count({ where: open }),
    db.dataSubjectRequest.count({ where: { AND: [open, dueBefore(now)] } }),
    db.dataSubjectRequest.count({
      where: { AND: [open, dueBefore(new Date(now.getTime() + 7 * DAY_MS)), { NOT: dueBefore(now) }] },
    }),
    db.dataSubjectRequest.count({
      where: { status: 'completed', processedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
    }),
    // En eski açık talepler — dueAt boş eski satırlar başvuru tarihinden hesaplanır.
    db.dataSubjectRequest.findMany({
      where: open,
      orderBy: [{ createdAt: 'asc' }],
      take: 50,
      select: { createdAt: true, dueAt: true },
    }),
  ]);
  const nearestDue = nearest
    .map((r) => effectiveDueAt(r))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    open: openCount,
    overdue,
    dueSoon,
    completed30,
    nearestDueDays: nearestDue ? daysRemaining(nearestDue, now) : null,
  };
}

// ───────────────────────────── Denetim kaydı kapsamı ─────────────────────────────

export async function getLogCoverage(db: Db, now = new Date(), windowDays = 7): Promise<LogCoverage> {
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  // Paydada yalnız bir kişinin yaptığı işlemler: sistem/cron olaylarında IP olmaz, sayılmaz.
  const base: Prisma.AuditLogWhereInput = { createdAt: { gte: since }, actorType: 'user', userId: { not: null } };
  const [total, withIp, withUa, missing] = await Promise.all([
    db.auditLog.count({ where: base }),
    db.auditLog.count({ where: { ...base, ipAddress: { not: null } } }),
    db.auditLog.count({ where: { ...base, userAgent: { not: null } } }),
    db.auditLog.groupBy({
      by: ['action'],
      where: { ...base, ipAddress: null },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
      take: 5,
    }),
  ]);
  return {
    windowDays,
    total,
    withIpPercent: percent(withIp, total),
    withUaPercent: percent(withUa, total),
    missingIpTop: (missing as Array<{ action: string; _count: { _all: number } }>).map((m) => ({
      action: m.action,
      count: m._count._all,
    })),
  };
}

// ───────────────────────────── Zamanlanmış işler ─────────────────────────────

const RETENTION_JOBS: Array<{ name: string; label: string }> = [
  { name: 'db-cleanup', label: 'Kişisel veri saklama ve teknik temizlik' },
  { name: 'analytics-event-cleanup', label: 'Analitik olay temizliği' },
];

export async function readRetentionJobs(db: Db): Promise<CronJobView[] | null> {
  try {
    const row = await db.settings.findUnique({ where: { key: 'cron_daily_state' }, select: { value: true } });
    const value = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Record<string, unknown>) : {};
    const jobs = value.jobs && typeof value.jobs === 'object' ? (value.jobs as Record<string, Record<string, unknown>>) : {};
    const s = (v: unknown) => (typeof v === 'string' ? v : null);
    return RETENTION_JOBS.map(({ name, label }) => {
      const j = jobs[name] ?? {};
      return {
        name,
        label,
        lastRunAt: s(j.lastRunAt),
        lastOkAt: s(j.lastOkAt),
        lastStatus: s(j.lastStatus),
        lastError: s(j.lastError),
        consecutiveFailures: typeof j.consecutiveFailures === 'number' ? j.consecutiveFailures : 0,
      };
    });
  } catch {
    return null;
  }
}

// ───────────────────────────── Uyum kontrolleri ─────────────────────────────

export interface CheckInputs {
  now: Date;
  dsr: DsrSummary;
  coverage: LogCoverage;
  jobs: CronJobView[] | null;
  consentLast30: number;
  suspiciousHigh: number;
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : (now.getTime() - t) / 3_600_000;
}

/** Saf: ölçülen girdilerden kontrol listesi. */
export function evaluateChecks(i: CheckInputs): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  checks.push(
    i.dsr.overdue > 0
      ? {
          id: 'dsr-overdue',
          title: 'KVKK talepleri 30 gün içinde yanıtlanıyor',
          status: 'fail',
          detail: `${i.dsr.overdue} talebin yasal süresi geçti.`,
          href: '?tab=talepler&status=overdue',
        }
      : i.dsr.dueSoon > 0
        ? {
            id: 'dsr-overdue',
            title: 'KVKK talepleri 30 gün içinde yanıtlanıyor',
            status: 'warn',
            detail: `Geciken yok; ${i.dsr.dueSoon} talebin süresi 7 gün içinde doluyor.`,
            href: '?tab=talepler&status=due_soon',
          }
        : {
            id: 'dsr-overdue',
            title: 'KVKK talepleri 30 gün içinde yanıtlanıyor',
            status: 'ok',
            detail: i.dsr.open > 0 ? `${i.dsr.open} açık talep, hepsi süresi içinde.` : 'Açık talep yok.',
            href: '?tab=talepler',
          }
  );

  const cleanup = i.jobs?.find((j) => j.name === 'db-cleanup') ?? null;
  const h = hoursSince(cleanup?.lastOkAt ?? null, i.now);
  checks.push({
    id: 'retention-job',
    title: 'Saklama süreleri her gün uygulanıyor',
    status: !i.jobs ? 'unknown' : h == null ? 'fail' : h <= 48 ? (cleanup?.consecutiveFailures ? 'warn' : 'ok') : 'fail',
    detail: !i.jobs
      ? 'Zamanlanmış iş durumu okunamadı.'
      : h == null
        ? 'Temizlik işi henüz hiç başarılı çalışmadı.'
        : h <= 48
          ? cleanup?.consecutiveFailures
            ? `Son başarılı çalışma ${Math.round(h)} saat önce; ardından ${cleanup.consecutiveFailures} hata.`
            : `Son başarılı çalışma ${Math.round(h)} saat önce.`
          : `Son başarılı çalışma ${Math.round(h / 24)} gün önce (48 saati aştı).`,
    href: '?tab=saklama',
  });

  const ip = i.coverage.withIpPercent;
  checks.push({
    id: 'audit-ip',
    title: '5651: kişi işlemleri IP ve tarayıcıyla kaydediliyor',
    status: ip == null ? 'unknown' : ip >= 95 ? 'ok' : ip >= 75 ? 'warn' : 'fail',
    detail:
      ip == null
        ? `Son ${i.coverage.windowDays} günde kişi aktörlü denetim kaydı yok; ölçülemedi.`
        : `Son ${i.coverage.windowDays} günde ${i.coverage.total} kaydın %${ip.toLocaleString('tr-TR')}'inde IP var.`,
    href: '?tab=kayitlar',
  });

  checks.push({
    id: 'consent-evidence',
    title: 'Çerez/izleme rızası kanıtlanıyor',
    status: i.consentLast30 > 0 ? 'ok' : 'warn',
    detail:
      i.consentLast30 > 0
        ? `Son 30 günde ${i.consentLast30} rıza kararı kaydedildi (sürüm ${CONSENT_VERSION}).`
        : 'Son 30 günde rıza kaydı yok; banner kaydı çalışıyor mu kontrol edin.',
    href: '?tab=riza',
  });

  checks.push({
    id: 'suspicious-high',
    title: 'Yüksek önemli güvenlik olayları çözülüyor',
    status: i.suspiciousHigh > 0 ? 'warn' : 'ok',
    detail: i.suspiciousHigh > 0 ? `${i.suspiciousHigh} yüksek/kritik olay çözülmeyi bekliyor.` : 'Açık yüksek/kritik olay yok.',
    href: '/admin/trust',
  });

  return checks;
}

export async function getPrivacyOverview(db: Db, now = new Date()): Promise<PrivacyOverview> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [dsr, coverage, jobs, unresolved, unresolvedHigh, consentLast30, consentCurrent] = await Promise.all([
    getDsrSummary(db, now),
    getLogCoverage(db, now),
    readRetentionJobs(db),
    db.suspiciousActivity.count({ where: { isResolved: false } }),
    db.suspiciousActivity.count({ where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } } }),
    db.consentRecord.count({ where: { createdAt: { gte: since30 } } }),
    db.consentRecord.count({ where: { createdAt: { gte: since30 }, version: String(CONSENT_VERSION) } }),
  ]);
  const cleanup = jobs?.find((j) => j.name === 'db-cleanup') ?? null;
  return {
    generatedAt: now.toISOString(),
    dsr,
    logCoverage: coverage,
    suspicious: { unresolved, unresolvedHigh },
    consent: { last30: consentLast30, currentVersion: CONSENT_VERSION, currentVersionShare: percent(consentCurrent, consentLast30) },
    retention: {
      lastOkAt: cleanup?.lastOkAt ?? null,
      lastStatus: cleanup?.lastStatus ?? null,
      consecutiveFailures: cleanup?.consecutiveFailures ?? 0,
    },
    checks: evaluateChecks({ now, dsr, coverage, jobs, consentLast30, suspiciousHigh: unresolvedHigh }),
  };
}

// ───────────────────────────── Saklama ─────────────────────────────

type CountDelegate = { count: (args: { where: Record<string, unknown> }) => Promise<number> };

function delegateOf(db: Db, model: string): CountDelegate {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  const d = (db as unknown as Record<string, CountDelegate | undefined>)[name];
  if (!d || typeof d.count !== 'function') throw new Error(`Bilinmeyen model: ${model}`);
  return d;
}

export async function getRetentionView(db: Db, now = new Date()): Promise<RetentionView> {
  const errors: string[] = [];
  const rules = await Promise.all(
    retentionEntries().map(async (e) => {
      const cutoff = new Date(now.getTime() - (e.retentionDays as number) * DAY_MS);
      let pending: number | null = null;
      try {
        pending = await delegateOf(db, e.model).count({ where: { [e.retentionField as string]: { lt: cutoff } } });
      } catch (err) {
        errors.push(`${registryKey(e)}: ${err instanceof Error ? err.message.slice(0, 120) : 'sayılamadı'}`);
      }
      return {
        key: registryKey(e),
        model: e.model,
        relation: e.relation,
        days: e.retentionDays as number,
        field: e.retentionField as string,
        pending,
        legalBasis: e.legalBasis,
      };
    })
  );
  const policies = PII_REGISTRY.filter((e) => typeof e.retentionDays === 'number' && !e.retentionField).map((e) => ({
    key: registryKey(e),
    model: e.model,
    days: e.retentionDays as number,
    legalBasis: e.legalBasis,
    note: e.note ?? null,
  }));
  let analyticsPending: number | null = null;
  try {
    analyticsPending = await db.analyticsEvent.count({
      // Saklama temizliğiyle AYNI filtre (ekonomi/sahtekârlık olayları korunur).
      where: retentionWhere(ANALYTICS_RETENTION_DAYS, now),
    });
  } catch {
    errors.push('AnalyticsEvent: sayılamadı');
  }
  const jobs = await readRetentionJobs(db);
  if (!jobs) errors.push('Zamanlanmış iş durumu okunamadı.');
  return {
    generatedAt: now.toISOString(),
    rules,
    policies,
    analytics: { days: ANALYTICS_RETENTION_DAYS, pending: analyticsPending },
    jobs: jobs ?? [],
    errors,
  };
}

// ───────────────────────────── Rıza ─────────────────────────────

export async function getConsentStats(db: Db & Raw, windowDays: number, now = new Date()): Promise<ConsentStats> {
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const where = { createdAt: { gte: since } };
  const [decisions, analytics, replay, marketing, rejectAll, byVersion, bySource, subjectRows, dailyRows] = await Promise.all([
    db.consentRecord.count({ where }),
    db.consentRecord.count({ where: { ...where, analytics: true } }),
    db.consentRecord.count({ where: { ...where, replay: true } }),
    db.consentRecord.count({ where: { ...where, marketing: true } }),
    db.consentRecord.count({ where: { ...where, analytics: false, replay: false, marketing: false } }),
    db.consentRecord.groupBy({ by: ['version'], where, _count: { _all: true } }),
    db.consentRecord.groupBy({ by: ['source'], where, _count: { _all: true } }),
    db.$queryRaw<Array<{ subjects: bigint | number; signed_in: bigint | number }>>`
      SELECT COUNT(DISTINCT COALESCE("userId", 'a:' || "anonId")) AS subjects,
             COUNT(DISTINCT "userId") AS signed_in
      FROM "ConsentRecord" WHERE "createdAt" >= ${since}`,
    db.$queryRaw<Array<{ day: string; count: bigint | number }>>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
             COUNT(*) AS count
      FROM "ConsentRecord" WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const byDay = new Map((dailyRows ?? []).map((r) => [r.day, Number(r.count)]));
  const daily: ConsentStats['daily'] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const day = istanbulDay(new Date(now.getTime() - i * DAY_MS));
    daily.push({ day, count: byDay.get(day) ?? 0 });
  }
  const subj = subjectRows?.[0];
  return {
    generatedAt: now.toISOString(),
    windowDays,
    currentVersion: CONSENT_VERSION,
    decisions,
    subjects: subj ? Number(subj.subjects) : 0,
    signedIn: subj ? Number(subj.signed_in) : 0,
    rates: {
      analytics: percent(analytics, decisions),
      replay: percent(replay, decisions),
      marketing: percent(marketing, decisions),
    },
    rejectAllRate: percent(rejectAll, decisions),
    byVersion: (byVersion as Array<{ version: string; _count: { _all: number } }>)
      .map((v) => ({ version: v.version, count: v._count._all, current: v.version === String(CONSENT_VERSION) }))
      .sort((a, b) => b.count - a.count),
    bySource: (bySource as Array<{ source: string | null; _count: { _all: number } }>)
      .map((v) => ({ source: v.source ?? 'bilinmiyor', count: v._count._all }))
      .sort((a, b) => b.count - a.count),
    daily,
  };
}

// ───────────────────────────── 5651 kayıtları ─────────────────────────────

export function encodeLogCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  return Buffer.from(`${iso}|${id}`, 'utf8').toString('base64url');
}

export function decodeLogCursor(cursor: string | undefined | null): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep <= 0) return null;
    const at = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(at.getTime()) || !id) return null;
    return { at, id };
  } catch {
    return null;
  }
}

const RUNTIME_EVENTS = ['module_gate_blocked', 'menu_visibility_blocked'];
const UA_MAX = 160;

function trimUa(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return ua.length > UA_MAX ? `${ua.slice(0, UA_MAX)}…` : ua;
}

/** Her kaynak için ortak zaman/cursor koşulu (createdAt desc, id desc). */
function pageWhere(q: LogsQuery, cursor: { at: Date; id: string } | null): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [];
  if (q.from) and.push({ createdAt: { gte: istanbulDayStart(q.from) } });
  if (q.to) and.push({ createdAt: { lt: new Date(istanbulDayStart(q.to).getTime() + DAY_MS) } });
  if (cursor) {
    and.push({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] });
  }
  return and;
}

const ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/**
 * Birleşik akış — kaynaklar arası keyset sayfalama: her kaynaktan en fazla `size+1` satır okunur,
 * birleştirilip kesilir. Kullanıcı araması e-posta/ad ile kullanıcı kimliklerine çözülür.
 */
export async function listUnifiedLogs(db: Db, q: LogsQuery, opts: { maxRows?: number } = {}): Promise<LogsPage> {
  const size = opts.maxRows ?? q.size;
  const cursor = decodeLogCursor(q.cursor);
  const take = size + 1;
  const want = (s: LogsQuery['source']) => q.source === 'all' || q.source === s;

  let userIds: string[] | null = null;
  if (q.user) {
    const users = await db.user.findMany({
      where: { OR: [{ email: { contains: q.user, mode: 'insensitive' } }, { name: { contains: q.user, mode: 'insensitive' } }] },
      select: { id: true },
      take: 100,
    });
    userIds = users.map((u) => u.id);
    if (userIds.length === 0) return { items: [], nextCursor: null };
  }
  const base = pageWhere(q, cursor);
  const userCond = userIds ? [{ userId: { in: userIds } }] : [];
  const text = q.q;

  const [audit, card, suspicious, runtime] = await Promise.all([
    want('audit')
      ? db.auditLog.findMany({
          where: {
            AND: [
              ...base,
              ...userCond,
              ...(text
                ? [{ OR: [{ action: { contains: text, mode: 'insensitive' } }, { entity: { contains: text, mode: 'insensitive' } }] }]
                : []),
            ],
          } as Prisma.AuditLogWhereInput,
          orderBy: ORDER,
          take,
          select: { id: true, action: true, entity: true, entityId: true, userId: true, createdAt: true, ipAddress: true, userAgent: true },
        })
      : Promise.resolve([]),
    want('card')
      ? db.cardAuditLog.findMany({
          where: {
            AND: [...base, ...userCond, ...(text ? [{ action: { contains: text, mode: 'insensitive' } }] : [])],
          } as Prisma.CardAuditLogWhereInput,
          orderBy: ORDER,
          take,
          select: { id: true, action: true, cardId: true, userId: true, createdAt: true, ipAddress: true, userAgent: true },
        })
      : Promise.resolve([]),
    want('suspicious')
      ? db.suspiciousActivity.findMany({
          where: {
            AND: [...base, ...userCond, ...(text ? [{ type: { contains: text, mode: 'insensitive' } }] : [])],
          } as Prisma.SuspiciousActivityWhereInput,
          orderBy: ORDER,
          take,
          select: { id: true, type: true, userId: true, createdAt: true, ipAddress: true, userAgent: true, severity: true },
        })
      : Promise.resolve([]),
    want('runtime')
      ? db.analyticsEvent.findMany({
          where: {
            AND: [
              ...base,
              ...userCond,
              { event: { in: RUNTIME_EVENTS } },
              ...(text ? [{ event: { contains: text, mode: 'insensitive' } }] : []),
            ],
          } as Prisma.AnalyticsEventWhereInput,
          orderBy: ORDER,
          take,
          select: { id: true, event: true, category: true, userId: true, createdAt: true, data: true },
        })
      : Promise.resolve([]),
  ]);

  type Draft = Omit<UnifiedLogRow, 'user' | 'createdAt'> & { userId: string | null; createdAt: Date };
  const drafts: Draft[] = [
    ...audit.map((l) => ({
      id: l.id,
      source: 'AUDIT' as LogSource,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId ?? null,
      userId: l.userId ?? null,
      createdAt: l.createdAt,
      ip: maskIpAddress(l.ipAddress),
      userAgent: trimUa(l.userAgent),
      severity: null,
      reason: null,
    })),
    ...card.map((l) => ({
      id: l.id,
      source: 'CARD_AUDIT' as LogSource,
      action: l.action,
      entity: 'Fiziksel kart',
      entityId: l.cardId ?? null,
      userId: l.userId ?? null,
      createdAt: l.createdAt,
      ip: maskIpAddress(l.ipAddress),
      userAgent: trimUa(l.userAgent),
      severity: null,
      reason: null,
    })),
    ...suspicious.map((l) => ({
      id: l.id,
      source: 'SUSPICIOUS' as LogSource,
      action: l.type,
      entity: 'Güvenlik',
      entityId: null,
      userId: l.userId ?? null,
      createdAt: l.createdAt,
      ip: maskIpAddress(l.ipAddress),
      userAgent: trimUa(l.userAgent),
      severity: l.severity ?? null,
      reason: null,
    })),
    ...runtime.map((l) => {
      const data = l.data && typeof l.data === 'object' && !Array.isArray(l.data) ? (l.data as Record<string, unknown>) : {};
      return {
        id: l.id,
        source: 'RUNTIME_GUARD' as LogSource,
        action: l.event,
        entity: String(data.routeKey ?? l.category ?? '—'),
        entityId: null,
        userId: l.userId ?? null,
        createdAt: l.createdAt,
        ip: maskIpAddress(typeof data.ipAddress === 'string' ? data.ipAddress : null),
        userAgent: trimUa(typeof data.userAgent === 'string' ? data.userAgent : null),
        severity: null,
        reason: typeof data.reason === 'string' ? data.reason : null,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const page = drafts.slice(0, size);
  const hasMore = drafts.length > size;
  const ids = Array.from(new Set(page.map((d) => d.userId).filter((v): v is string => Boolean(v))));
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const last = page[page.length - 1];
  return {
    items: page.map(({ userId, createdAt, ...rest }) => ({
      ...rest,
      createdAt: createdAt.toISOString(),
      user: userId ? { id: userId, name: byId.get(userId)?.name ?? null, email: byId.get(userId)?.email ?? null } : null,
    })),
    nextCursor: hasMore && last ? encodeLogCursor(last.createdAt, last.id) : null,
  };
}

/** CSV (Excel uyumlu BOM + `;` ayraç). Formül enjeksiyonuna karşı `=+-@` önekli hücreler kaçırılır. */
export function logsToCsv(rows: readonly UnifiedLogRow[]): string {
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Zaman (UTC)', 'Kaynak', 'İşlem', 'Varlık', 'Varlık kimliği', 'Kullanıcı', 'E-posta', 'IP (maskeli)', 'Tarayıcı', 'Önem', 'Neden'];
  const lines = rows.map((r) =>
    [r.createdAt, r.source, r.action, r.entity, r.entityId, r.user?.name, r.user?.email, r.ip, r.userAgent, r.severity, r.reason]
      .map(esc)
      .join(';')
  );
  return `﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}
