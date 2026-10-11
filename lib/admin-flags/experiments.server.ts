/**
 * A/B deneyleri — sunucu mantığı (/admin/features "Deneyler").
 *
 * Depolama: `Settings.innovationPlatform.campaignAb.experiments` (sistemde GERÇEKTEN çalışan
 * A/B altyapısı: `pickAbVariant` hash ataması + `/api/customer/innovation/ab/*` gösterim/dönüşüm
 * olayları). Yaşam döngüsü alanları (status, hipotez, başlangıç/bitiş, kazanan) aynı kayda eklenir.
 *
 * Kapatılan rapor bulguları (admin_ab-testing.md):
 *  1  tedavisi uygulanmayan bayi kohort "deneyi" kaldırıldı; burada yalnız varyantı GERÇEKTEN
 *     sunulan deneyler var
 *  2  atama sırayla değil hash ile (yapışkan, ağırlıklı); atama denetleyicisi
 *  3  sonuçlar deney penceresiyle sınırlı (startedAt…endedAt), tekil kullanıcı bazlı
 *  4  lift, %95 GA (Wilson/Newcombe), z-testi p, SRM, yetersiz örneklem uyarısı — sunucuda
 *  5  her geçiş gerekçeli, iyimser kilitli ve denetimli
 */
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { cachedJson } from '@/lib/redis';
import {
  INNOVATION_PLATFORM_SETTINGS_KEY,
  getInnovationPlatformConfig,
  type AbCampaignExperiment,
  type InnovationPlatformConfig,
} from '@/lib/innovation-config';
import { MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import { actorSnapshot, type ActionCtx } from './modules.server';
import { MIN_SAMPLE_PER_VARIANT, compareVariants, sampleRatioMismatch, wilson } from './stats';
import type {
  AssignmentCheck,
  CreateExperimentInput,
  Dimension,
  ExperimentActionInput,
  ExperimentResults,
  ExperimentRow,
  ExperimentStatus,
  ExperimentsState,
  VariantStats,
} from './contract';

/** Saklanan kayıt: eski alanlar + yaşam döngüsü (geriye uyumlu; eski okuyucular `active`'e bakar). */
export type StoredExperiment = AbCampaignExperiment & {
  status?: ExperimentStatus;
  hypothesis?: string | null;
  primaryMetric?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string | null;
  winner?: 'A' | 'B' | null;
  decisionNote?: string | null;
  ownerId?: string | null;
};

const DIMS: readonly Dimension[] = ['copy', 'push_title', 'push_hour', 'banner_image'];

export function statusOf(e: StoredExperiment): ExperimentStatus {
  if (e.status && ['draft', 'running', 'paused', 'completed'].includes(e.status)) {
    // `active` eski okuyucuların gerçeğidir; tutarsızsa ona uy.
    if (e.status === 'running' && !e.active) return 'paused';
    if (e.status !== 'running' && e.active) return 'running';
    return e.status;
  }
  return e.active ? 'running' : 'paused';
}

export function toRow(e: StoredExperiment, defaultSplit: number, owners: Map<string, string>): ExperimentRow {
  const dimension = (DIMS as readonly string[]).includes(e.dimension ?? '') ? (e.dimension as Dimension) : 'copy';
  return {
    id: e.id,
    name: e.name,
    status: statusOf(e),
    dimension,
    hypothesis: e.hypothesis ?? null,
    primaryMetric: e.primaryMetric ?? null,
    variantA: e.variantA,
    variantB: e.variantB,
    splitPercentB: e.splitPercentB ?? defaultSplit,
    startedAt: e.startedAt ?? null,
    endedAt: e.endedAt ?? null,
    createdAt: e.createdAt ?? null,
    winner: e.winner ?? null,
    decisionNote: e.decisionNote ?? null,
    owner: e.ownerId ? (owners.get(e.ownerId) ?? null) : null,
    legacy: !e.status,
  };
}

async function readState(): Promise<{ cfg: InnovationPlatformConfig; version: string | null; killSwitchOn: boolean }> {
  const [cfg, row, controls] = await Promise.all([
    getInnovationPlatformConfig(),
    prisma.settings.findUnique({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } }),
    prisma.settings.findUnique({ where: { key: MODULE_CONTROLS_SETTINGS_KEY }, select: { value: true } }),
  ]);
  return { cfg, version: row?.updatedAt ? row.updatedAt.toISOString() : null, killSwitchOn: normalizeModuleControls(controls?.value).ab_testing !== false };
}

export async function getExperimentsState(): Promise<ExperimentsState> {
  const { cfg, version, killSwitchOn } = await readState();
  const list = (cfg.campaignAb?.experiments ?? []) as StoredExperiment[];
  const ownerIds = [...new Set(list.map((e) => e.ownerId).filter((x): x is string => !!x))];
  const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o.name || o.email || o.id]));
  const split = cfg.campaignAb?.defaultSplitPercentForB ?? 50;
  const order: Record<ExperimentStatus, number> = { running: 0, paused: 1, draft: 2, completed: 3 };
  const experiments = list
    .map((e) => toRow(e, split, ownerMap))
    .sort((a, b) => order[a.status] - order[b.status] || (b.startedAt ?? b.createdAt ?? '').localeCompare(a.startedAt ?? a.createdAt ?? ''));
  return { version, experiments, killSwitchOn, defaultSplitPercentForB: split };
}

/** Varyant metnini boyuta göre varyant ucunun okuduğu alanlara yazar. */
export function applyDimensionFields(base: StoredExperiment, dim: Dimension, a: string, b: string): StoredExperiment {
  const next: StoredExperiment = { ...base, dimension: dim, variantA: a, variantB: b };
  delete next.pushTitleA;
  delete next.pushTitleB;
  delete next.pushHourA;
  delete next.pushHourB;
  delete next.bannerImageUrlA;
  delete next.bannerImageUrlB;
  if (dim === 'push_title') Object.assign(next, { pushTitleA: a, pushTitleB: b });
  if (dim === 'push_hour') Object.assign(next, { pushHourA: a, pushHourB: b });
  if (dim === 'banner_image') Object.assign(next, { bannerImageUrlA: a, bannerImageUrlB: b });
  return next;
}

type Mutator = (list: StoredExperiment[]) => { list: StoredExperiment[]; action: string; entityId: string; oldData?: unknown; newData: unknown };

async function writeExperiments(ctx: ActionCtx, baseVersion: string | null, mutate: Mutator): Promise<string> {
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.settings.findUnique({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } });
    const current = row?.updatedAt ? row.updatedAt.toISOString() : null;
    if (current !== baseVersion) throw new ApiError('CONFLICT', 'Deneyler bu arada değişti. Listeyi yenileyip tekrar deneyin.');
    const cfg = await getInnovationPlatformConfig();
    const list = [...((cfg.campaignAb?.experiments ?? []) as StoredExperiment[])];
    const out = mutate(list);
    const next = { ...cfg, campaignAb: { ...(cfg.campaignAb ?? { defaultSplitPercentForB: 50 }), experiments: out.list } };
    let updatedAt: Date;
    if (row) {
      const res = await tx.settings.updateMany({
        where: { key: INNOVATION_PLATFORM_SETTINGS_KEY, updatedAt: row.updatedAt },
        data: { value: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 0) throw new ApiError('CONFLICT', 'Deneyler bu arada değişti. Listeyi yenileyip tekrar deneyin.');
      updatedAt = (await tx.settings.findUniqueOrThrow({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } })).updatedAt;
    } else {
      updatedAt = (
        await tx.settings.create({ data: { key: INNOVATION_PLATFORM_SETTINGS_KEY, category: 'admin', value: next as unknown as Prisma.InputJsonValue }, select: { updatedAt: true } })
      ).updatedAt;
    }
    const h = ctx.request?.headers;
    await tx.auditLog.create({
      data: {
        userId: ctx.actor.id,
        actorType: 'user',
        actorSnapshot: actorSnapshot(ctx),
        action: out.action,
        entity: 'Experiment',
        entityId: out.entityId,
        oldData: out.oldData === undefined ? Prisma.JsonNull : (out.oldData as Prisma.InputJsonValue),
        newData: out.newData as Prisma.InputJsonValue,
        ipAddress: h?.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: h?.get('user-agent')?.slice(0, 300) ?? null,
      },
    });
    return updatedAt;
  });
  return saved.toISOString();
}

const snapshot = (e: StoredExperiment) => ({
  name: e.name,
  status: statusOf(e),
  dimension: e.dimension ?? 'copy',
  variantA: e.variantA,
  variantB: e.variantB,
  splitPercentB: e.splitPercentB ?? null,
  winner: e.winner ?? null,
});

export async function createExperiment(ctx: ActionCtx, input: CreateExperimentInput): Promise<string> {
  return writeExperiments(ctx, input.baseVersion, (list) => {
    if (list.some((e) => e.id === input.id)) throw new ApiError('CONFLICT', `"${input.id}" anahtarlı bir deney zaten var.`);
    if (list.length >= 50) throw new ApiError('CONFLICT', 'En fazla 50 deney tutulabilir. Eski taslakları silin.');
    const rec = applyDimensionFields(
      {
        id: input.id,
        name: input.name,
        variantA: input.variantA,
        variantB: input.variantB,
        active: false,
        splitPercentB: input.splitPercentB,
        status: 'draft',
        hypothesis: input.hypothesis,
        primaryMetric: input.primaryMetric,
        createdAt: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
        winner: null,
        decisionNote: null,
        ownerId: ctx.actor.id,
      },
      input.dimension,
      input.variantA,
      input.variantB
    );
    return { list: [...list, rec], action: 'experiment.create', entityId: input.id, newData: snapshot(rec) };
  });
}

export async function actOnExperiment(ctx: ActionCtx, id: string, input: ExperimentActionInput): Promise<string> {
  const version = await writeExperiments(ctx, input.baseVersion, (list) => {
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) throw new ApiError('NOT_FOUND', 'Deney bulunamadı.');
    const cur = list[idx];
    const status = statusOf(cur);
    const now = new Date().toISOString();
    const replace = (rec: StoredExperiment) => list.map((e, i) => (i === idx ? rec : e));

    if (input.action === 'delete') {
      if (status !== 'draft') throw new ApiError('CONFLICT', 'Yalnız taslak deneyler silinebilir; çalışmış deneyin verisi korunur.');
      return { list: list.filter((_, i) => i !== idx), action: 'experiment.delete', entityId: id, oldData: snapshot(cur), newData: { name: cur.name } };
    }

    if (input.action === 'edit') {
      if (status === 'completed') throw new ApiError('CONFLICT', 'Tamamlanmış deney düzenlenemez.');
      const started = status !== 'draft';
      // Çalışmış deneyde varyant/pay değişirse atama bozulur (SRM) ve sonuçlar karışır.
      if (started) {
        const split = cur.splitPercentB ?? 50;
        const changed =
          input.variantA !== cur.variantA || input.variantB !== cur.variantB || input.splitPercentB !== split || input.dimension !== (cur.dimension ?? 'copy');
        if (changed) throw new ApiError('CONFLICT', 'Başlamış deneyde varyantlar, boyut ve trafik payı değiştirilemez. Yeni bir deney açın.');
      }
      const rec = applyDimensionFields(
        { ...cur, name: input.name, hypothesis: input.hypothesis, primaryMetric: input.primaryMetric, splitPercentB: input.splitPercentB },
        input.dimension,
        input.variantA,
        input.variantB
      );
      return { list: replace(rec), action: 'experiment.edit', entityId: id, oldData: snapshot(cur), newData: snapshot(rec) };
    }

    const allowed: Record<typeof input.action, ExperimentStatus[]> = {
      start: ['draft'],
      pause: ['running'],
      resume: ['paused'],
      complete: ['running', 'paused'],
    };
    if (!allowed[input.action].includes(status)) {
      throw new ApiError('CONFLICT', `Bu deney "${status}" durumunda; bu geçiş yapılamaz.`);
    }
    let rec: StoredExperiment;
    if (input.action === 'start') rec = { ...cur, status: 'running', active: true, startedAt: now, endedAt: null };
    else if (input.action === 'pause') rec = { ...cur, status: 'paused', active: false };
    else if (input.action === 'resume') rec = { ...cur, status: 'running', active: true, startedAt: cur.startedAt ?? now };
    else rec = { ...cur, status: 'completed', active: false, endedAt: now, winner: input.winner ?? null, decisionNote: input.reason };
    return {
      list: replace(rec),
      action: `experiment.${input.action}`,
      entityId: id,
      oldData: snapshot(cur),
      newData: { ...snapshot(rec), reason: input.reason },
    };
  });
  return version;
}

// ───────────────────────────── Sonuçlar ─────────────────────────────

type CountRow = { variant: string | null; event: string; events: number; users: number; anon: number };
type ConvRow = { variant: string | null; n: number };
type DayRow = { day: string; variant: string | null; event: string; n: number };

function bucketOf(seed: string): number {
  return createHash('sha256').update(seed, 'utf8').digest().readUInt32BE(0) % 100;
}

export async function getExperimentResults(id: string): Promise<ExperimentResults> {
  const { cfg } = await readState();
  const exp = ((cfg.campaignAb?.experiments ?? []) as StoredExperiment[]).find((e) => e.id === id);
  if (!exp) throw new ApiError('NOT_FOUND', 'Deney bulunamadı.');
  const status = statusOf(exp);
  const split = (exp.splitPercentB ?? cfg.campaignAb?.defaultSplitPercentForB ?? 50) / 100;
  const to = exp.endedAt ? new Date(exp.endedAt) : new Date();
  // Eski kayıtların başlangıcı bilinmiyor → son 90 gün (sınırlı tarama).
  const from = exp.startedAt ? new Date(exp.startedAt) : new Date(to.getTime() - 90 * 86_400_000);
  const cacheKey = `admin:exp:results:${id}:${status}:${exp.startedAt ?? 'x'}:${exp.endedAt ?? 'open'}`;

  return cachedJson(cacheKey, status === 'completed' ? 600 : 60, async () => {
    const base = Prisma.sql`category = 'innovation_ab' AND data->>'experimentId' = ${id} AND "createdAt" >= ${from} AND "createdAt" < ${to}`;
    const [counts, conv, days] = await Promise.all([
      prisma.$queryRaw<CountRow[]>`
        SELECT data->>'variant' AS variant, event, COUNT(*)::int AS events,
               COUNT(DISTINCT "userId")::int AS users, COUNT(*) FILTER (WHERE "userId" IS NULL)::int AS anon
        FROM "AnalyticsEvent" WHERE ${base} GROUP BY 1, 2`,
      prisma.$queryRaw<ConvRow[]>`
        SELECT i.variant, COUNT(DISTINCT c."userId")::int AS n
        FROM (SELECT DISTINCT "userId", data->>'variant' AS variant FROM "AnalyticsEvent"
              WHERE ${base} AND event = 'innovation_ab_impression' AND "userId" IS NOT NULL) i
        JOIN "AnalyticsEvent" c ON c."userId" = i."userId" AND c.category = 'innovation_ab'
          AND c.event = 'innovation_ab_conversion' AND c.data->>'experimentId' = ${id}
          AND c.data->>'variant' = i.variant AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
        GROUP BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS day,
               data->>'variant' AS variant, event, COUNT(*)::int AS n
        FROM "AnalyticsEvent" WHERE ${base} AND "createdAt" >= ${new Date(Math.max(from.getTime(), to.getTime() - 60 * 86_400_000))}
        GROUP BY 1, 2, 3 ORDER BY 1`,
    ]);

    const pick = (v: 'A' | 'B', ev: string) => counts.find((r) => r.variant === v && r.event === ev);
    const variants = (['A', 'B'] as const).map((v): VariantStats => {
      const imp = pick(v, 'innovation_ab_impression');
      const cv = pick(v, 'innovation_ab_conversion');
      const exposed = Number(imp?.users ?? 0);
      const converted = Math.min(exposed, Number(conv.find((r) => r.variant === v)?.n ?? 0));
      const ci = wilson(converted, exposed);
      return {
        variant: v,
        expectedShare: v === 'B' ? split : 1 - split,
        exposedUsers: exposed,
        convertedUsers: converted,
        impressions: Number(imp?.events ?? 0),
        conversions: Number(cv?.events ?? 0),
        anonymousImpressions: Number(imp?.anon ?? 0),
        rate: exposed > 0 ? (converted / exposed) * 100 : null,
        ci: ci ? [ci[0] * 100, ci[1] * 100] : null,
      };
    }) as [VariantStats, VariantStats];

    const dayMap = new Map<string, { day: string; aImpr: number; bImpr: number; aConv: number; bConv: number }>();
    for (const d of days) {
      const row = dayMap.get(d.day) ?? { day: d.day, aImpr: 0, bImpr: 0, aConv: 0, bConv: 0 };
      const n = Number(d.n) || 0;
      if (d.event === 'innovation_ab_impression') d.variant === 'B' ? (row.bImpr += n) : d.variant === 'A' && (row.aImpr += n);
      else if (d.event === 'innovation_ab_conversion') d.variant === 'B' ? (row.bConv += n) : d.variant === 'A' && (row.aConv += n);
      dayMap.set(d.day, row);
    }

    return {
      experimentId: id,
      window: { from: exp.startedAt ?? null, to: to.toISOString() },
      variants,
      comparison: compareVariants({
        aExposed: variants[0].exposedUsers,
        aConverted: variants[0].convertedUsers,
        bExposed: variants[1].exposedUsers,
        bConverted: variants[1].convertedUsers,
      }),
      srm: sampleRatioMismatch(variants[0].exposedUsers, variants[1].exposedUsers, split),
      minSample: MIN_SAMPLE_PER_VARIANT,
      daily: [...dayMap.values()],
      generatedAt: new Date().toISOString(),
    };
  });
}

/** Atama denetleyicisi: bir kullanıcının (kimlik ya da e-posta) hangi varyanta düştüğü. */
export async function checkAssignment(id: string, subject: string): Promise<AssignmentCheck> {
  const { cfg } = await readState();
  const exp = ((cfg.campaignAb?.experiments ?? []) as StoredExperiment[]).find((e) => e.id === id);
  if (!exp) throw new ApiError('NOT_FOUND', 'Deney bulunamadı.');
  const s = subject.trim();
  const user = await prisma.user.findFirst({
    where: s.includes('@') ? { email: { equals: s, mode: 'insensitive' } } : { id: s },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new ApiError('NOT_FOUND', 'Bu kimlik ya da e-postayla kullanıcı bulunamadı.');
  // Varyant ucu `pickAbVariant` ile aynı hesap: sha256("<userId>:<deneyId>") % 100 < B payı → B
  // (deney duraklatılmışsa da kendi payıyla gösterilir; testte pickAbVariant ile eşitliği doğrulanır).
  const pct = Math.min(99, Math.max(1, exp.splitPercentB ?? cfg.campaignAb?.defaultSplitPercentForB ?? 50));
  const bucket = bucketOf(`${user.id}:${id}`);
  const variant: 'A' | 'B' = bucket < pct ? 'B' : 'A';
  return {
    subject: s,
    resolvedUserId: user.id,
    label: user.name || user.email || null,
    bucket,
    variant,
    experimentActive: exp.active === true,
  };
}
