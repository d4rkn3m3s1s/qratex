/**
 * Platform ayarları — SUNUCU mantığı (/admin/settings BFF'leri ve sayfa ön yüklemesi).
 *
 *  - Okuma: yalnız kayıt defterindeki anahtarlar + sürümleri (`updatedAt`) + bağlam
 *    (SEO kimliği, dönemsel konsept, e-posta, Google, Redis/bakım yayını, gizli kapı özeti).
 *  - Yazma: anahtar başına zod, sürüm kontrolü (409), tek transaction, anahtar başına
 *    STANDART denetim kaydı `{ settingKey, value }` (eski/yeni) — geri alma yalnız bu biçimi kabul eder (B3).
 *  - Bakım modu kaydı Redis'e yayınlanır (proxy okuyucusu); Redis yoksa bakım AÇILAMAZ.
 *  - Erişim (rol bazlı özellik + menü görünürlüğü) sürüm kontrollü; global modül aç/kapa
 *    tek kaynakta: /admin/features (B9).
 */
import { revalidateTag } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, type ApiErrorDetail } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { isRedisConfigured, redisGetJson, redisSetJson } from '@/lib/redis';
import {
  VERSION_CONFLICT_MESSAGE,
  isVersionConflictError,
  versionFromDate,
  writeVersionedSetting,
  writeVersionedSettingsBatch,
} from '@/lib/settings-version';
import {
  PLATFORM_AUDIT,
  PLATFORM_AUDIT_ENTITY,
  PLATFORM_SETTINGS,
  PLATFORM_SETTING_KEYS,
  SETTINGS_KEYS,
  isPlatformSettingKey,
  parseMaintenance,
  parsePlatformSetting,
  validatePlatformSetting,
  type MaintenanceState,
  type PlatformSettingKey,
  type PlatformSettingValues,
  type PlatformSettingsPatch,
} from '@/lib/platform-settings/registry';
import { MAINTENANCE_REDIS_KEY, MAINTENANCE_REDIS_TTL_SECONDS } from '@/lib/platform-settings/maintenance-edge';
import { MODULE_CATALOG, MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import { MODULE_GATE_CACHE_TAG } from '@/lib/module-gate';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_CATALOG_BY_ROLE,
  MENU_VISIBILITY_SETTINGS_KEY,
  SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
  normalizeVisibilitySettingsWithSystem,
} from '@/lib/visibility-controls';

export interface ActionContext {
  actor: AuditActor;
  request?: { headers: { get(name: string): string | null } } | null;
}

// ───────────────────────────── Tipler ─────────────────────────────

export type MaintenanceEdgeStatus = 'synced' | 'repaired' | 'unavailable';

export interface GateSummary {
  question: string;
  isDefaultAnswer: boolean;
  cfgVer: number;
  updatedAt: string | null;
  failures24h: number;
  locks24h: number;
}

export interface PlatformSettingsState {
  values: PlatformSettingValues;
  versions: Record<PlatformSettingKey, string>;
  context: {
    seo: { siteName: string; siteUrl: string } | null;
    seasonal: { name: string; backgroundEffect: string | null; endDate: string } | null;
    mail: { configured: boolean; smtp: boolean; resend: boolean };
    googleEnvConfigured: boolean;
    googleLinkedUsers: number | null;
    redisConfigured: boolean;
    maintenanceEdge: MaintenanceEdgeStatus;
    /** null → kapı özeti okunamadı (ekranda hata olarak gösterilir, sıfır DEĞİL). */
    gate: GateSummary | null;
  };
}

// ───────────────────────────── Okuma ─────────────────────────────

async function readRegistryRows() {
  const rows = await prisma.settings.findMany({
    where: { key: { in: [...PLATFORM_SETTING_KEYS] } },
    select: { key: true, value: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const values = {} as Record<PlatformSettingKey, unknown>;
  const versions = {} as Record<PlatformSettingKey, string>;
  for (const key of PLATFORM_SETTING_KEYS) {
    const row = byKey.get(key);
    values[key] = parsePlatformSetting(key, row?.value);
    versions[key] = versionFromDate(row?.updatedAt);
  }
  return { values: values as PlatformSettingValues, versions };
}

/** Bakım durumunu Redis'e yayınlar (proxy okuyucusu). Redis yoksa false. */
export async function publishMaintenance(state: MaintenanceState): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  await redisSetJson(MAINTENANCE_REDIS_KEY, state, MAINTENANCE_REDIS_TTL_SECONDS);
  return true;
}

/** DB (kaynak) ile Redis (proxy) bakım değerini karşılaştırır; farklıysa onarır. */
export async function syncMaintenanceEdge(dbState: MaintenanceState): Promise<MaintenanceEdgeStatus> {
  if (!isRedisConfigured()) return 'unavailable';
  const hot = await redisGetJson<unknown>(MAINTENANCE_REDIS_KEY);
  const parsed = hot == null ? null : parseMaintenance(hot);
  const same =
    parsed !== null &&
    parsed.enabled === dbState.enabled &&
    parsed.message === dbState.message &&
    parsed.plannedEndAt === dbState.plannedEndAt;
  if (same) {
    // Ömrü yenile (kayıt 30 günde düşmesin).
    await redisSetJson(MAINTENANCE_REDIS_KEY, dbState, MAINTENANCE_REDIS_TTL_SECONDS);
    return 'synced';
  }
  await redisSetJson(MAINTENANCE_REDIS_KEY, dbState, MAINTENANCE_REDIS_TTL_SECONDS);
  return 'repaired';
}

async function readGateSummary(): Promise<GateSummary | null> {
  try {
    const { loadAdminGate, publicGateView, ADMIN_GATE_AUDIT } = await import('@/lib/admin-gate');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [gate, failures24h, locks24h] = await Promise.all([
      loadAdminGate(),
      prisma.auditLog.count({ where: { action: ADMIN_GATE_AUDIT.FAILED, createdAt: { gte: since } } }),
      prisma.auditLog.count({ where: { action: ADMIN_GATE_AUDIT.LOCKED, createdAt: { gte: since } } }),
    ]);
    const view = publicGateView(gate);
    return {
      question: view.question,
      isDefaultAnswer: view.isDefaultAnswer,
      cfgVer: view.cfgVer,
      updatedAt: view.updatedAt,
      failures24h,
      locks24h,
    };
  } catch {
    return null;
  }
}

async function readSeoIdentity(): Promise<{ siteName: string; siteUrl: string } | null> {
  try {
    const { getSeoSettingsFull } = await import('@/lib/seo-settings');
    const { global } = await getSeoSettingsFull();
    return { siteName: global.siteName, siteUrl: global.siteUrl };
  } catch {
    return null;
  }
}

async function readSeasonal(): Promise<PlatformSettingsState['context']['seasonal']> {
  try {
    const { getActiveSeasonalConcept } = await import('@/lib/seasonal-concept-core');
    const c = await getActiveSeasonalConcept();
    return c ? { name: c.name, backgroundEffect: c.backgroundEffect, endDate: c.endDate } : null;
  } catch {
    return null;
  }
}

async function readMail(): Promise<PlatformSettingsState['context']['mail']> {
  try {
    const { getMailDeliverySummary } = await import('@/lib/mail-sender');
    return getMailDeliverySummary();
  } catch {
    return { configured: false, smtp: false, resend: false };
  }
}

/** Ayar ekranının tüm verisi. Kayıt defteri satırları okunamazsa FIRLATIR (QueryState hatası). */
export async function getPlatformSettingsState(): Promise<PlatformSettingsState> {
  const [registry, seo, seasonal, mail, gate, googleLinkedUsers] = await Promise.all([
    readRegistryRows(),
    readSeoIdentity(),
    readSeasonal(),
    readMail(),
    readGateSummary(),
    prisma.account.count({ where: { provider: 'google' } }).catch(() => null),
  ]);
  const maintenanceEdge = await syncMaintenanceEdge(registry.values[SETTINGS_KEYS.maintenance]).catch(
    () => 'unavailable' as const
  );
  return {
    values: registry.values,
    versions: registry.versions,
    context: {
      seo,
      seasonal,
      mail,
      googleEnvConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      googleLinkedUsers,
      redisConfigured: isRedisConfigured(),
      maintenanceEdge,
      gate,
    },
  };
}

// ───────────────────────────── Yazma ─────────────────────────────

function conflictError(e: unknown): ApiError {
  const conflicts = isVersionConflictError(e) ? e.conflicts : [];
  return new ApiError('VERSION_CONFLICT', VERSION_CONFLICT_MESSAGE, { status: 409, details: { conflicts } });
}

function maintenanceUnavailable(): ApiError {
  return new ApiError(
    'MAINTENANCE_UNAVAILABLE',
    'Bakım modu bu ortamda uygulanamaz: Redis yapılandırılmamış (UPSTASH_REDIS_REST_URL/TOKEN). Açık görünüp hiçbir şeyi kapatmayan bir anahtar kaydedilmedi.',
    { status: 409 }
  );
}

async function afterWrite(keys: PlatformSettingKey[], values: Partial<PlatformSettingValues>): Promise<void> {
  const tags = new Set<string>();
  for (const k of keys) for (const t of PLATFORM_SETTINGS[k].cacheTags) tags.add(t);
  for (const t of tags) {
    try {
      revalidateTag(t, { expire: 0 });
    } catch {
      /* statik bağlam dışı (test) */
    }
  }
  const m = values[SETTINGS_KEYS.maintenance];
  if (m) await publishMaintenance(m);
}

export async function savePlatformSettings(ctx: ActionContext, input: PlatformSettingsPatch): Promise<PlatformSettingsState> {
  const details: ApiErrorDetail[] = [];
  const clean: Array<{ key: PlatformSettingKey; value: unknown; baseVersion: string }> = [];
  const seen = new Set<string>();
  for (const [i, change] of input.changes.entries()) {
    if (!isPlatformSettingKey(change.key)) {
      details.push({ path: `changes.${i}.key`, message: 'Bu ayar düzenlenemez.' });
      continue;
    }
    if (seen.has(change.key)) {
      details.push({ path: `changes.${i}.key`, message: 'Aynı ayar iki kez gönderildi.' });
      continue;
    }
    seen.add(change.key);
    const v = validatePlatformSetting(change.key, change.value);
    if (!v.ok) {
      details.push({ path: change.key, message: v.message });
      continue;
    }
    clean.push({ key: change.key, value: v.value, baseVersion: change.baseVersion });
  }
  if (details.length > 0) throw new ApiError('VALIDATION', undefined, { details });

  const maint = clean.find((c) => c.key === SETTINGS_KEYS.maintenance)?.value as MaintenanceState | undefined;
  if (maint?.enabled && !isRedisConfigured()) throw maintenanceUnavailable();

  try {
    await prisma.$transaction(async (tx) => {
      const res = await writeVersionedSettingsBatch(
        tx,
        clean.map((c) => ({
          key: c.key,
          value: c.value as Prisma.InputJsonValue,
          categoryOnCreate: PLATFORM_SETTINGS[c.key].category,
          baseVersion: c.baseVersion,
        }))
      );
      for (const c of clean) {
        await tx.auditLog.create({
          data: auditEntry(
            ctx.actor,
            {
              action: PLATFORM_AUDIT.UPDATE,
              entity: PLATFORM_AUDIT_ENTITY,
              entityId: c.key,
              oldData: { settingKey: c.key, value: res.previous[c.key] ?? null },
              newData: { settingKey: c.key, value: c.value },
            },
            ctx.request
          ),
        });
      }
    });
  } catch (e) {
    if (isVersionConflictError(e)) throw conflictError(e);
    throw e;
  }

  const written: Partial<PlatformSettingValues> = {};
  for (const c of clean) (written as Record<string, unknown>)[c.key] = c.value;
  await afterWrite(
    clean.map((c) => c.key),
    written
  );
  return getPlatformSettingsState();
}

// ───────────────────────────── Geçmiş + geri alma ─────────────────────────────

export interface HistoryItem {
  id: string;
  action: string;
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  at: string;
  actor: { name: string | null; email: string | null } | null;
  revertible: boolean;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export const ACCESS_AUDIT_ACTION = 'platform_access_update';
const HISTORY_ACTIONS = [PLATFORM_AUDIT.UPDATE, PLATFORM_AUDIT.REVERT, ACCESS_AUDIT_ACTION];

const ACCESS_LABELS: Record<string, string> = {
  [FEATURE_VISIBILITY_SETTINGS_KEY]: 'Rol bazlı özellik görünürlüğü',
  [MENU_VISIBILITY_SETTINGS_KEY]: 'Rol bazlı menü görünürlüğü',
  [SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY]: 'Sistem görünürlüğü (eski)',
};

function readSnapshot(raw: unknown): { settingKey: string | null; value: unknown } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { settingKey: null, value: null };
  const o = raw as Record<string, unknown>;
  return { settingKey: typeof o.settingKey === 'string' ? o.settingKey : null, value: o.value ?? null };
}

export function labelForKey(key: string): string {
  if (isPlatformSettingKey(key)) return PLATFORM_SETTINGS[key].label;
  return ACCESS_LABELS[key] ?? key;
}

export async function listPlatformHistory(opts: { cursor?: string | null; limit?: number }): Promise<HistoryPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: HISTORY_ACTIONS }, entity: PLATFORM_AUDIT_ENTITY },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      entityId: true,
      oldData: true,
      newData: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map((r) => {
      const before = readSnapshot(r.oldData);
      const after = readSnapshot(r.newData);
      const key = after.settingKey ?? before.settingKey ?? r.entityId ?? '';
      return {
        id: r.id,
        action: r.action,
        key,
        label: labelForKey(key),
        before: before.value,
        after: after.value,
        at: r.createdAt.toISOString(),
        actor: r.user ? { name: r.user.name, email: r.user.email } : null,
        revertible:
          (r.action === PLATFORM_AUDIT.UPDATE || r.action === PLATFORM_AUDIT.REVERT) &&
          isPlatformSettingKey(key) &&
          before.settingKey === key &&
          r.entityId === key,
      };
    }),
    nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
  };
}

export interface RevertPreview {
  key: PlatformSettingKey;
  label: string;
  current: unknown;
  target: unknown;
  currentVersion: string;
}

export async function revertPlatformSetting(
  ctx: ActionContext,
  input: { auditLogId: string; baseVersion?: string; dryRun?: boolean }
): Promise<{ preview: RevertPreview; state: PlatformSettingsState | null }> {
  const log = await prisma.auditLog.findUnique({
    where: { id: input.auditLogId },
    select: { id: true, action: true, entity: true, entityId: true, oldData: true },
  });
  if (!log || log.entity !== PLATFORM_AUDIT_ENTITY || (log.action !== PLATFORM_AUDIT.UPDATE && log.action !== PLATFORM_AUDIT.REVERT)) {
    throw new ApiError('NOT_FOUND', 'Bu kayıt geri alınabilir bir ayar değişikliği değil.');
  }
  const snap = readSnapshot(log.oldData);
  const key = snap.settingKey;
  if (!key || key !== log.entityId || !isPlatformSettingKey(key)) {
    throw new ApiError('BAD_REQUEST', 'Bu kaydın biçimi geri almaya uygun değil.');
  }
  const target = snap.value === null ? PLATFORM_SETTINGS[key].default : snap.value;
  const valid = validatePlatformSetting(key, target);
  if (!valid.ok) throw new ApiError('VALIDATION', `Önceki değer artık geçerli değil: ${valid.message}`);

  const row = await prisma.settings.findUnique({ where: { key }, select: { value: true, updatedAt: true } });
  const preview: RevertPreview = {
    key,
    label: PLATFORM_SETTINGS[key].label,
    current: parsePlatformSetting(key, row?.value),
    target: valid.value,
    currentVersion: versionFromDate(row?.updatedAt),
  };
  if (input.dryRun) return { preview, state: null };
  if (!input.baseVersion) {
    throw new ApiError('BASE_VERSION_REQUIRED', 'Geri almadan önce güncel değeri görüntüleyin.', { status: 428 });
  }
  if (key === SETTINGS_KEYS.maintenance && (valid.value as MaintenanceState).enabled && !isRedisConfigured()) {
    throw maintenanceUnavailable();
  }

  try {
    await prisma.$transaction(async (tx) => {
      const res = await writeVersionedSetting(tx, {
        key,
        value: valid.value as Prisma.InputJsonValue,
        category: PLATFORM_SETTINGS[key].category,
        baseVersion: input.baseVersion!,
      });
      await tx.auditLog.create({
        data: auditEntry(
          ctx.actor,
          {
            action: PLATFORM_AUDIT.REVERT,
            entity: PLATFORM_AUDIT_ENTITY,
            entityId: key,
            oldData: { settingKey: key, value: res.previous ?? null },
            newData: { settingKey: key, value: valid.value, revertOf: log.id },
          },
          ctx.request
        ),
      });
    });
  } catch (e) {
    if (isVersionConflictError(e)) throw conflictError(e);
    throw e;
  }
  await afterWrite([key], { [key]: valid.value } as Partial<PlatformSettingValues>);
  return { preview, state: await getPlatformSettingsState() };
}

// ───────────────────────────── Erişim (rol görünürlüğü) ─────────────────────────────

export interface AccessFeature {
  key: string;
  label: string;
  description: string;
  severity: string;
  /** Global modül anahtarı (/admin/features). false → rol ayarından bağımsız kapalı. */
  globallyEnabled: boolean;
}

export interface AccessState {
  features: { dealer: AccessFeature[]; customer: AccessFeature[] };
  menu: { dealer: Array<{ key: string; label: string; href: string }>; customer: Array<{ key: string; label: string; href: string }> };
  featureVisibility: { dealer: Record<string, boolean>; customer: Record<string, boolean> };
  menuVisibility: { dealer: Record<string, boolean>; customer: Record<string, boolean> };
  /** Eski "sistem görünürlüğü" katmanında kapalı kalmış yönetici/platform modülleri (B9). */
  systemBlocked: Array<{ key: string; label: string }>;
  versions: { feature: string; menu: string; system: string };
}

export async function getAccessState(): Promise<AccessState> {
  const rows = await prisma.settings.findMany({
    where: {
      key: {
        in: [
          FEATURE_VISIBILITY_SETTINGS_KEY,
          MENU_VISIBILITY_SETTINGS_KEY,
          SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
          MODULE_CONTROLS_SETTINGS_KEY,
        ],
      },
    },
    select: { key: true, value: true, updatedAt: true },
  });
  const by = new Map(rows.map((r) => [r.key, r]));
  const normalized = normalizeVisibilitySettingsWithSystem(
    by.get(FEATURE_VISIBILITY_SETTINGS_KEY)?.value,
    by.get(MENU_VISIBILITY_SETTINGS_KEY)?.value,
    by.get(SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY)?.value
  );
  const controls = normalizeModuleControls(by.get(MODULE_CONTROLS_SETTINGS_KEY)?.value);
  const feat = (scope: 'dealer' | 'customer'): AccessFeature[] =>
    MODULE_CATALOG.filter((m) => m.scope === scope).map((m) => ({
      key: m.key,
      label: m.label,
      description: m.description,
      severity: m.severity,
      globallyEnabled: controls[m.key] !== false,
    }));
  const systemBlocked = MODULE_CATALOG.filter(
    (m) => (m.scope === 'admin' || m.scope === 'platform') && normalized.featureVisibility.system[m.key] === false
  ).map((m) => ({ key: m.key, label: m.label }));
  const menuOf = (role: 'dealer' | 'customer') => MENU_CATALOG_BY_ROLE[role].map((i) => ({ key: i.key, label: i.label, href: i.href }));
  return {
    features: { dealer: feat('dealer'), customer: feat('customer') },
    menu: { dealer: menuOf('dealer'), customer: menuOf('customer') },
    featureVisibility: { dealer: normalized.featureVisibility.dealer, customer: normalized.featureVisibility.customer },
    menuVisibility: normalized.menuVisibility,
    systemBlocked,
    versions: {
      feature: versionFromDate(by.get(FEATURE_VISIBILITY_SETTINGS_KEY)?.updatedAt),
      menu: versionFromDate(by.get(MENU_VISIBILITY_SETTINGS_KEY)?.updatedAt),
      system: versionFromDate(by.get(SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY)?.updatedAt),
    },
  };
}

export interface AccessSaveInput {
  featureVisibility: { dealer: Record<string, boolean>; customer: Record<string, boolean> };
  menuVisibility: { dealer: Record<string, boolean>; customer: Record<string, boolean> };
  /** true → eski sistem görünürlüğü katmanındaki bütün kapatmaları kaldır. */
  clearSystemBlocks?: boolean;
  baseVersions: { feature: string; menu: string; system?: string };
}

export function validateAccessKeys(input: AccessSaveInput): ApiErrorDetail[] {
  const details: ApiErrorDetail[] = [];
  for (const role of ['dealer', 'customer'] as const) {
    const featureKeys = new Set(MODULE_CATALOG.filter((m) => m.scope === role).map((m) => m.key));
    const menuKeys = new Set(MENU_CATALOG_BY_ROLE[role].map((m) => m.key));
    for (const k of Object.keys(input.featureVisibility[role])) {
      if (!featureKeys.has(k)) details.push({ path: `featureVisibility.${role}.${k}`, message: 'Bilinmeyen özellik anahtarı.' });
    }
    for (const k of Object.keys(input.menuVisibility[role])) {
      if (!menuKeys.has(k)) details.push({ path: `menuVisibility.${role}.${k}`, message: 'Bilinmeyen menü anahtarı.' });
    }
  }
  return details;
}

export async function saveAccess(ctx: ActionContext, input: AccessSaveInput): Promise<AccessState> {
  const details = validateAccessKeys(input);
  if (details.length > 0) throw new ApiError('VALIDATION', undefined, { details });
  if (input.clearSystemBlocks && !input.baseVersions.system) {
    throw new ApiError('BASE_VERSION_REQUIRED', 'Sayfayı yenileyip tekrar deneyin.', { status: 428 });
  }
  const normalized = normalizeVisibilitySettingsWithSystem(input.featureVisibility, input.menuVisibility, null);
  const entries = [
    {
      key: FEATURE_VISIBILITY_SETTINGS_KEY,
      value: { dealer: normalized.featureVisibility.dealer, customer: normalized.featureVisibility.customer } as Prisma.InputJsonValue,
      categoryOnCreate: 'admin',
      baseVersion: input.baseVersions.feature,
    },
    {
      key: MENU_VISIBILITY_SETTINGS_KEY,
      value: normalized.menuVisibility as unknown as Prisma.InputJsonValue,
      categoryOnCreate: 'admin',
      baseVersion: input.baseVersions.menu,
    },
    ...(input.clearSystemBlocks
      ? [
          {
            key: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
            value: normalized.featureVisibility.system as Prisma.InputJsonValue,
            categoryOnCreate: 'admin',
            baseVersion: input.baseVersions.system ?? null,
          },
        ]
      : []),
  ];
  try {
    await prisma.$transaction(async (tx) => {
      const res = await writeVersionedSettingsBatch(tx, entries);
      for (const e of entries) {
        await tx.auditLog.create({
          data: auditEntry(
            ctx.actor,
            {
              action: ACCESS_AUDIT_ACTION,
              entity: PLATFORM_AUDIT_ENTITY,
              entityId: e.key,
              oldData: { settingKey: e.key, value: res.previous[e.key] ?? null },
              newData: { settingKey: e.key, value: e.value },
            },
            ctx.request
          ),
        });
      }
    });
  } catch (e) {
    if (isVersionConflictError(e)) throw conflictError(e);
    throw e;
  }
  try {
    revalidateTag(MODULE_GATE_CACHE_TAG, { expire: 0 });
  } catch {
    /* test bağlamı */
  }
  return getAccessState();
}
