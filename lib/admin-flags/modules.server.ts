/**
 * Modül Kontrol Düzlemi — sunucu mantığı (/admin/features "Modül anahtarları").
 *
 * Kapatılan rapor bulguları (admin_modules.md):
 *  B1  zorlama seviyesi koddan türetilir (`module-gate-bindings.json`); etkisiz anahtar kapatılamaz
 *  B3  hata görünür (defineRoute zarfı; "0 kullanıcı" yok)
 *  B4  elle yazılmış endpoint tablosu → taranmış bağlar + katalog dışı kapı uyarısı
 *  B5  engelleme sayımı SQL GROUP BY (gerekçe + oturumsuz kırılımı), 2000 satır kesmesi yok
 *  B6  rol görünürlüğü matrisi
 *  B7  yerinde aç/kapa: tek modül, gerekçeli, iyimser kilit (409), tek işlemde denetim
 *  B8  tutarsız "kayıt: N" metriği kaldırıldı
 */
import type { Prisma } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { MODULE_CATALOG, MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_VISIBILITY_SETTINGS_KEY,
  SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
  normalizeVisibilitySettingsWithSystem,
} from '@/lib/visibility-controls';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import bindingsFile from '@/lib/data/module-gate-bindings.json';
import { adminHrefFor, previewPathFor } from './module-meta';
import { isRuleLive, parseRolloutMeta } from './rollout';
import { ROLLOUT_CACHE_TAG } from './rollout.server';
import type {
  BlockCounts,
  Enforcement,
  HistoryItem,
  HistoryQueryInput,
  ModuleBindings,
  ModuleChange,
  ModuleRow,
  ModulesOverview,
  Paged,
  PatchModuleInput,
  RolloutSummary,
} from './contract';

export type ActionCtx = {
  actor: { id: string; email?: string | null; role?: string | null; name?: string | null };
  request?: { headers: { get(name: string): string | null } } | null;
};

type BindingsJson = { keys: Record<string, ModuleBindings>; unknownKeys: Record<string, string[]> };
const BINDINGS = bindingsFile as unknown as BindingsJson;

const EMPTY_BINDINGS: ModuleBindings = { api: [], pages: [], server: [], landing: [], menu: [] };

export function bindingsFor(key: string): ModuleBindings {
  return BINDINGS.keys[key] ?? EMPTY_BINDINGS;
}

export function enforcementOf(b: ModuleBindings): Enforcement {
  if (b.api.length) return 'api';
  if (b.pages.length) return 'page';
  if (b.server.length) return 'server';
  if (b.landing.length) return 'landing';
  if (b.menu.length) return 'menu';
  return 'none';
}

export function unknownGateKeys() {
  return Object.entries(BINDINGS.unknownKeys).map(([key, files]) => ({ key, files }));
}

function reqMeta(ctx: ActionCtx) {
  const h = ctx.request?.headers;
  const fwd = h?.get('x-forwarded-for')?.split(',')[0]?.trim() || h?.get('x-real-ip') || null;
  return { ipAddress: fwd, userAgent: h?.get('user-agent')?.slice(0, 300) ?? null };
}

export function actorSnapshot(ctx: ActionCtx): Prisma.InputJsonValue {
  return { email: ctx.actor.email ?? null, role: ctx.actor.role ?? null, name: ctx.actor.name ?? null };
}

// ───────────────────────────── Değişiklik geçmişi ─────────────────────────────

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: Prisma.JsonValue;
  newData: Prisma.JsonValue;
  actorSnapshot: Prisma.JsonValue;
  createdAt: Date;
  user: { name: string | null; email: string | null } | null;
};

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function actorName(r: AuditRow): string | null {
  const s = asObj(r.actorSnapshot);
  return r.user?.name || r.user?.email || (typeof s.name === 'string' && s.name) || (typeof s.email === 'string' && s.email) || null;
}

const LABEL = new Map(MODULE_CATALOG.map((m) => [m.key, m.label]));
const labelOf = (k: string) => LABEL.get(k) ?? k;

/** Eski Ayar Merkezi yazımları tüm haritayı yazar: fark → modül bazlı değişiklik listesi. */
export function diffLegacyModules(oldData: unknown, newData: unknown): { key: string; from: boolean | null; to: boolean }[] {
  const before = asObj(oldData);
  const after = asObj(newData);
  const out: { key: string; from: boolean | null; to: boolean }[] = [];
  for (const m of MODULE_CATALOG) {
    const to = after[m.key];
    if (typeof to !== 'boolean') continue;
    const fromRaw = before[m.key];
    const from = typeof fromRaw === 'boolean' ? fromRaw : Object.keys(before).length ? true : null;
    if (from !== to) out.push({ key: m.key, from, to });
  }
  return out;
}

const AUDIT_SELECT = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  oldData: true,
  newData: true,
  actorSnapshot: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} as const;

const MODULE_WHERE: Prisma.AuditLogWhereInput = {
  OR: [{ entity: 'ModuleControl' }, { entity: 'settings', action: { in: ['update_modules', 'create_modules'] } }],
};
const ROLLOUT_WHERE: Prisma.AuditLogWhereInput = { entity: 'FeatureFlag' };
const EXPERIMENT_WHERE: Prisma.AuditLogWhereInput = { entity: 'Experiment' };

export function toHistoryItem(r: AuditRow): HistoryItem | null {
  const n = asObj(r.newData);
  const reason = typeof n.reason === 'string' ? n.reason : null;
  const at = r.createdAt.toISOString();
  const actor = actorName(r);
  if (r.entity === 'ModuleControl') {
    const key = r.entityId ?? '';
    const enabled = n.enabled === true;
    return { id: r.id, at, kind: 'module', subject: key, action: r.action, summary: `${labelOf(key)} ${enabled ? 'açıldı' : 'kapatıldı'}`, actor, reason };
  }
  if (r.entity === 'settings') {
    const changes = diffLegacyModules(r.oldData, r.newData);
    if (!changes.length) return { id: r.id, at, kind: 'module', subject: '', action: r.action, summary: 'Ayar Merkezi modül kaydı (değişiklik yok)', actor, reason: null };
    const text = changes
      .slice(0, 4)
      .map((c) => `${labelOf(c.key)} ${c.to ? 'açıldı' : 'kapatıldı'}`)
      .join(', ');
    return {
      id: r.id,
      at,
      kind: 'module',
      subject: changes.map((c) => c.key).join(','),
      action: r.action,
      summary: `Ayar Merkezi: ${text}${changes.length > 4 ? ` +${changes.length - 4}` : ''}`,
      actor,
      reason: null,
    };
  }
  if (r.entity === 'FeatureFlag') {
    const key = typeof n.key === 'string' ? n.key : (r.entityId ?? '');
    const pct = typeof n.percent === 'number' ? n.percent : null;
    const verb: Record<string, string> = {
      'rollout.create': 'kademeli açılış başlatıldı',
      'rollout.update': 'kademeli açılış güncellendi',
      'rollout.stop': 'kademeli açılış durduruldu',
      'flag.archive': 'yetim bayrak arşivlendi',
    };
    return {
      id: r.id,
      at,
      kind: 'rollout',
      subject: key,
      action: r.action,
      summary: `${labelOf(key)}: ${verb[r.action] ?? r.action}${pct !== null && r.action !== 'flag.archive' ? ` (%${pct})` : ''}`,
      actor,
      reason,
    };
  }
  if (r.entity === 'Experiment') {
    const verb: Record<string, string> = {
      'experiment.create': 'oluşturuldu',
      'experiment.edit': 'düzenlendi',
      'experiment.start': 'başlatıldı',
      'experiment.pause': 'duraklatıldı',
      'experiment.resume': 'sürdürüldü',
      'experiment.complete': 'tamamlandı',
      'experiment.delete': 'taslak silindi',
    };
    const name = typeof n.name === 'string' ? n.name : (r.entityId ?? '');
    const winner = typeof n.winner === 'string' ? ` · kazanan ${n.winner}` : '';
    return { id: r.id, at, kind: 'experiment', subject: r.entityId ?? '', action: r.action, summary: `Deney "${name}" ${verb[r.action] ?? r.action}${winner}`, actor, reason };
  }
  return null;
}

export async function listHistory(q: HistoryQueryInput): Promise<Paged<HistoryItem>> {
  const ors: Prisma.AuditLogWhereInput[] = [];
  if (q.kind === 'all' || q.kind === 'module') ors.push(MODULE_WHERE);
  if (q.kind === 'all' || q.kind === 'rollout') ors.push(ROLLOUT_WHERE);
  if (q.kind === 'all' || q.kind === 'experiment') ors.push(EXPERIMENT_WHERE);
  const where: Prisma.AuditLogWhereInput = { OR: ors };

  if (q.key) {
    // Eski Ayar Merkezi satırları tüm haritayı taşır → sınırlı pencerede bellekte süz.
    const rows = (await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 400, select: AUDIT_SELECT })) as AuditRow[];
    const items = rows
      .map(toHistoryItem)
      .filter((x): x is HistoryItem => !!x && x.subject.split(',').includes(q.key!));
    const start = (q.page - 1) * q.size;
    return { items: items.slice(start, start + q.size), total: items.length, page: q.page, size: q.size };
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.size, take: q.size, select: AUDIT_SELECT }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: (rows as AuditRow[]).map(toHistoryItem).filter((x): x is HistoryItem => !!x), total, page: q.page, size: q.size };
}

/** Modül başına son değişiklik (son 300 denetim satırı içinde). */
async function lastChanges(): Promise<Map<string, ModuleChange>> {
  const rows = (await prisma.auditLog.findMany({
    where: { OR: [MODULE_WHERE, { entity: 'FeatureFlag', action: { startsWith: 'rollout.' } }] },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: AUDIT_SELECT,
  })) as AuditRow[];
  const out = new Map<string, ModuleChange>();
  for (const r of rows) {
    const actor = actorName(r);
    const at = r.createdAt.toISOString();
    const n = asObj(r.newData);
    const o = asObj(r.oldData);
    const reason = typeof n.reason === 'string' ? n.reason : null;
    if (r.entity === 'ModuleControl' && r.entityId && !out.has(r.entityId)) {
      out.set(r.entityId, {
        at,
        key: r.entityId,
        from: typeof o.enabled === 'boolean' ? o.enabled : null,
        to: typeof n.enabled === 'boolean' ? n.enabled : null,
        actor,
        reason,
        source: 'feature_control',
        summary: n.enabled === true ? 'Açıldı' : 'Kapatıldı',
      });
    } else if (r.entity === 'settings') {
      for (const c of diffLegacyModules(r.oldData, r.newData)) {
        if (!out.has(c.key)) out.set(c.key, { at, key: c.key, from: c.from, to: c.to, actor, reason: null, source: 'settings', summary: c.to ? 'Açıldı (Ayar Merkezi)' : 'Kapatıldı (Ayar Merkezi)' });
      }
    } else if (r.entity === 'FeatureFlag') {
      const key = typeof n.key === 'string' ? n.key : null;
      if (key && !out.has(key)) out.set(key, { at, key, from: null, to: null, actor, reason, source: 'rollout', summary: r.action === 'rollout.stop' ? 'Kademeli açılış durduruldu' : `Kademeli açılış %${n.percent ?? '?'}` });
    }
  }
  return out;
}

// ───────────────────────────── Genel bakış ─────────────────────────────

type BlockRow = { key: string | null; reason: string | null; anon: boolean; n: number };

async function blocks24h(): Promise<Map<string, BlockCounts>> {
  const rows = await prisma.$queryRaw<BlockRow[]>`
    SELECT data->>'moduleKey' AS key, data->>'reason' AS reason, ("userId" IS NULL) AS anon, COUNT(*)::int AS n
    FROM "AnalyticsEvent"
    WHERE event = 'module_gate_blocked' AND "createdAt" > NOW() - INTERVAL '24 hours'
    GROUP BY 1, 2, 3`;
  const out = new Map<string, BlockCounts>();
  for (const r of rows) {
    if (!r.key) continue;
    const c = out.get(r.key) ?? { global: 0, role: 0, rollout: 0, anonymous: 0, total: 0 };
    const n = Number(r.n) || 0;
    if (r.reason === 'module_disabled_globally') c.global += n;
    else if (r.reason === 'module_disabled_for_role') c.role += n;
    else if (r.reason === 'module_rollout_excluded') c.rollout += n;
    if (r.anon) c.anonymous += n;
    c.total += n;
    out.set(r.key, c);
  }
  return out;
}

async function readControls() {
  const row = await prisma.settings.findUnique({ where: { key: MODULE_CONTROLS_SETTINGS_KEY }, select: { value: true, updatedAt: true } });
  return { controls: normalizeModuleControls(row?.value), version: row?.updatedAt ? row.updatedAt.toISOString() : null };
}

async function readVisibility() {
  const [f, m, s] = await Promise.all([
    prisma.settings.findUnique({ where: { key: FEATURE_VISIBILITY_SETTINGS_KEY }, select: { value: true } }),
    prisma.settings.findUnique({ where: { key: MENU_VISIBILITY_SETTINGS_KEY }, select: { value: true } }),
    prisma.settings.findUnique({ where: { key: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY }, select: { value: true } }),
  ]);
  return normalizeVisibilitySettingsWithSystem(f?.value, m?.value, s?.value);
}

export function rolloutSummaryOf(row: { isEnabled: boolean; expiresAt: Date | null; metadata: Prisma.JsonValue }, now = new Date()): RolloutSummary | null {
  const meta = parseRolloutMeta(row.metadata);
  if (meta.kind !== 'module_rollout' || meta.archivedAt) return null;
  const live = isRuleLive({ active: row.isEnabled, expiresAt: row.expiresAt }, now);
  return {
    active: row.isEnabled,
    percent: meta.percent,
    allowCount: meta.allowUserIds.length,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    expired: row.isEnabled && !live,
  };
}

export async function getModulesOverview(): Promise<ModulesOverview> {
  const [{ controls, version }, visibility, blocks, flags, changes, innovation] = await Promise.all([
    readControls(),
    readVisibility(),
    blocks24h(),
    prisma.featureFlag.findMany({ where: { key: { in: MODULE_CATALOG.map((m) => m.key) } }, select: { key: true, isEnabled: true, expiresAt: true, metadata: true } }),
    lastChanges(),
    getInnovationPlatformConfig(),
  ]);
  const flagByKey = new Map(flags.map((f) => [f.key, f]));
  const fv = visibility.featureVisibility;
  const pick = (v: unknown) => (typeof v === 'boolean' ? v : null);
  const zero: BlockCounts = { global: 0, role: 0, rollout: 0, anonymous: 0, total: 0 };

  const modules: ModuleRow[] = MODULE_CATALOG.map((m) => {
    const b = bindingsFor(m.key);
    const flag = flagByKey.get(m.key);
    return {
      key: m.key,
      label: m.label,
      description: m.description,
      scope: m.scope,
      severity: m.severity,
      enabled: controls[m.key] !== false,
      enforcement: enforcementOf(b),
      bindings: b,
      roles: { customer: pick(fv.customer?.[m.key]), dealer: pick(fv.dealer?.[m.key]), system: pick(fv.system?.[m.key]) },
      blocks24h: blocks.get(m.key) ?? zero,
      rollout: flag ? rolloutSummaryOf(flag) : null,
      adminHref: adminHrefFor(m.key),
      previewPath: previewPathFor(m.key),
      lastChange: changes.get(m.key) ?? null,
    };
  });

  const experiments = innovation.campaignAb?.experiments ?? [];
  return {
    generatedAt: new Date().toISOString(),
    version,
    modules,
    unknownKeys: unknownGateKeys(),
    totals: {
      modules: modules.length,
      disabled: modules.filter((m) => !m.enabled).length,
      roleRestricted: modules.filter((m) => m.roles.customer === false || m.roles.dealer === false || m.roles.system === false).length,
      inert: modules.filter((m) => m.enforcement === 'none').length,
      apiGated: modules.filter((m) => m.enforcement === 'api').length,
      blocks24h: modules.reduce((s, m) => s + m.blocks24h.total, 0),
      activeRollouts: modules.filter((m) => m.rollout?.active && !m.rollout.expired && m.rollout.percent < 100).length,
      runningExperiments: experiments.filter((e) => e.active).length,
    },
    killSwitches: { featureFlags: controls.feature_flags !== false, abTesting: controls.ab_testing !== false },
  };
}

// ───────────────────────────── Yerinde aç/kapa ─────────────────────────────

export async function patchModule(ctx: ActionCtx, key: string, input: PatchModuleInput): Promise<{ key: string; enabled: boolean; version: string }> {
  const item = MODULE_CATALOG.find((m) => m.key === key);
  if (!item) throw new ApiError('NOT_FOUND', 'Modül bulunamadı.');
  const enforcement = enforcementOf(bindingsFor(key));
  if (enforcement === 'none' && input.enabled === false) {
    throw new ApiError('CONFLICT', 'Bu anahtarı okuyan kod yok; kapatmak hiçbir şeyi değiştirmez. Önce koda bağlanmalı.', { status: 409 });
  }

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.settings.findUnique({ where: { key: MODULE_CONTROLS_SETTINGS_KEY }, select: { value: true, updatedAt: true } });
    const current = row?.updatedAt ? row.updatedAt.toISOString() : null;
    if (current !== input.baseVersion) throw new ApiError('CONFLICT', 'Modül ayarları bu arada değişti. Listeyi yenileyip tekrar deneyin.');
    const controls = normalizeModuleControls(row?.value);
    const before = controls[key] !== false;
    if (before === input.enabled) throw new ApiError('BAD_REQUEST', 'Değişiklik yok: modül zaten bu durumda.');
    const next = { ...controls, [key]: input.enabled };

    let updatedAt: Date;
    if (row) {
      const res = await tx.settings.updateMany({
        where: { key: MODULE_CONTROLS_SETTINGS_KEY, updatedAt: row.updatedAt },
        data: { value: next as Prisma.InputJsonValue },
      });
      if (res.count === 0) throw new ApiError('CONFLICT', 'Modül ayarları bu arada değişti. Listeyi yenileyip tekrar deneyin.');
      updatedAt = (await tx.settings.findUniqueOrThrow({ where: { key: MODULE_CONTROLS_SETTINGS_KEY }, select: { updatedAt: true } })).updatedAt;
    } else {
      updatedAt = (
        await tx.settings.create({
          data: { key: MODULE_CONTROLS_SETTINGS_KEY, category: 'admin', value: next as Prisma.InputJsonValue },
          select: { updatedAt: true },
        })
      ).updatedAt;
    }
    await tx.auditLog.create({
      data: {
        userId: ctx.actor.id,
        actorType: 'user',
        actorSnapshot: actorSnapshot(ctx),
        action: input.enabled ? 'module.enable' : 'module.disable',
        entity: 'ModuleControl',
        entityId: key,
        oldData: { enabled: before } as Prisma.InputJsonValue,
        newData: { enabled: input.enabled, reason: input.reason, severity: item.severity, enforcement } as Prisma.InputJsonValue,
        ...reqMeta(ctx),
      },
    });
    return updatedAt;
  });

  revalidateTag(ROLLOUT_CACHE_TAG, { expire: 0 });
  return { key, enabled: input.enabled, version: saved.toISOString() };
}
