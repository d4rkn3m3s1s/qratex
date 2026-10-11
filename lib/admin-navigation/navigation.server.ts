/**
 * Navigasyon Stüdyosu — sunucu çekirdeği (yalnız sunucu).
 *
 *  - `getNavigationState`: üç ayar anahtarı + modül durumları + son değişiklik, TEK okuma.
 *  - `saveNavigation`: C2 iyimser kilit (baseVersion yok → 428, uyuşmazlık → 409); yalnız
 *    değişen anahtarlar yazılır; tüm yazımlar + tek denetim satırı aynı transaction'da;
 *    kimlikler kayıtla doğrulanır (varsayılan reddet); kabuk önbelleği anında tazelenir.
 *  - `listNavigationHistory`: sayfalı sürüm geçmişi (insan okunur fark + geri yüklenebilir parçalar).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import {
  BASE_VERSION_REQUIRED_CODE,
  BASE_VERSION_REQUIRED_MESSAGE,
  VERSION_CONFLICT_CODE,
  VERSION_CONFLICT_MESSAGE,
  lockResource,
  nextUpdatedAt,
  versionFromDate,
} from '@/lib/settings-version';
import { SIDEBAR_NAV_ORDER_SETTINGS_KEY, normalizeSidebarNavOrder, type SidebarNavOrderPayload } from '@/lib/sidebar-order-settings';
import {
  SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
  normalizeSidebarNavGroups,
  type SidebarNavGroupsPayload,
} from '@/lib/sidebar-groups-settings';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_VISIBILITY_SETTINGS_KEY,
  getMenuCatalogKeys,
  normalizeMenuVisibility,
  normalizeFeatureVisibility,
} from '@/lib/visibility-controls';
import { MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import { canonicalizeGroupsPayload, canonicalizeOrderIds } from '@/lib/navigation/settings';
import { NAV_SETTINGS_TAG } from '@/lib/navigation/cache-tags';
import { routesForRole } from '@/lib/navigation/registry';
import {
  STUDIO_ROLES,
  ROLE_LABEL,
  describeRoleDiff,
  emptyRoleConfig,
  pruneRoleConfig,
  supportsVisibility,
  type NavHistoryEntry,
  type NavHistoryPage,
  type NavPutBody,
  type NavStudioState,
  type RoleConfig,
  type StudioRole,
  type StudioVersions,
} from './contract';

export const NAV_PUBLISH_ACTION = 'navigation_studio_publish';

/** Geçmişte gösterilen eylemler (eski sayfaların yazdıkları dahil). */
export const NAV_HISTORY_ACTIONS = [
  NAV_PUBLISH_ACTION,
  'create_sidebar_nav_order',
  'update_sidebar_nav_order',
  'create_sidebar_nav_groups',
  'update_sidebar_nav_groups',
  'create_menu_visibility',
  'update_menu_visibility',
];

const KEY_OF: Record<keyof StudioVersions, string> = {
  order: SIDEBAR_NAV_ORDER_SETTINGS_KEY,
  groups: SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
  visibility: MENU_VISIBILITY_SETTINGS_KEY,
};

type Row = { key: string; value: unknown; updatedAt?: Date | null };
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

// ───────────────────────────── Okuma ─────────────────────────────

function toGroupLabel(v: unknown): { tr?: string; en?: string } {
  if (typeof v === 'string') return v.trim() ? { tr: v, en: v } : {};
  if (isObj(v)) return { ...(typeof v.tr === 'string' ? { tr: v.tr } : {}), ...(typeof v.en === 'string' ? { en: v.en } : {}) };
  return {};
}

/** Ham ayar değerleri → rol başına stüdyo yapılandırması (kayıt kimliklerine göç eder). */
export function roleConfigsFromValues(values: { order?: unknown; groups?: unknown; visibility?: unknown }): Record<StudioRole, RoleConfig> {
  const order = normalizeSidebarNavOrder(values.order);
  const groups = normalizeSidebarNavGroups(values.groups);
  const vis = values.visibility === undefined ? null : normalizeMenuVisibility(values.visibility);
  const out = {} as Record<StudioRole, RoleConfig>;
  for (const role of STUDIO_ROLES) {
    const cfg = emptyRoleConfig();
    cfg.order = canonicalizeOrderIds(role, order[role] ?? []).value;
    const g = groups[role] ? canonicalizeGroupsPayload(role, groups[role]!).value : {};
    for (const [gid, label] of Object.entries(g.groupLabels ?? {})) cfg.groupLabels[gid] = toGroupLabel(label);
    cfg.itemGroups = { ...(g.itemGroups ?? {}) };
    if (supportsVisibility(role) && vis) {
      cfg.hidden = Object.entries(vis[role]).filter(([, on]) => on === false).map(([k]) => k);
    }
    out[role] = pruneRoleConfig(role, cfg);
  }
  return out;
}

/** Modül kapısı / rol özellik görünürlüğü kapalı olan modül anahtarları. */
export function modulesOffFromValues(moduleControlsRaw: unknown, featureRaw: unknown): NavStudioState['modulesOff'] {
  const controls = normalizeModuleControls(moduleControlsRaw);
  const feature = normalizeFeatureVisibility(featureRaw, null);
  const off = (role: 'dealer' | 'customer') => {
    const keys = new Set<string>();
    for (const r of routesForRole(role)) {
      if (!r.moduleKey) continue;
      if (controls[r.moduleKey] === false || feature[role]?.[r.moduleKey] === false) keys.add(r.moduleKey);
    }
    return Array.from(keys).sort();
  };
  return { dealer: off('dealer'), customer: off('customer') };
}

function actorLabel(r: { actorSnapshot?: unknown; user?: { name: string | null; email: string | null } | null }): string {
  if (r.user?.name) return r.user.name;
  if (r.user?.email) return r.user.email;
  const snap = isObj(r.actorSnapshot) ? r.actorSnapshot : null;
  if (snap && typeof snap.name === 'string' && snap.name) return snap.name;
  if (snap && typeof snap.email === 'string' && snap.email) return snap.email;
  return 'Bilinmeyen yönetici';
}

export async function getNavigationState(): Promise<NavStudioState> {
  const rows: Row[] = await prisma.settings.findMany({
    where: {
      key: {
        in: [
          SIDEBAR_NAV_ORDER_SETTINGS_KEY,
          SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
          MENU_VISIBILITY_SETTINGS_KEY,
          FEATURE_VISIBILITY_SETTINGS_KEY,
          MODULE_CONTROLS_SETTINGS_KEY,
        ],
      },
    },
    select: { key: true, value: true, updatedAt: true },
  });
  const by = new Map(rows.map((r) => [r.key, r]));
  const last = await prisma.auditLog.findFirst({
    where: { action: { in: NAV_HISTORY_ACTIONS } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
  });
  return {
    roles: roleConfigsFromValues({
      order: by.get(SIDEBAR_NAV_ORDER_SETTINGS_KEY)?.value,
      groups: by.get(SIDEBAR_NAV_GROUPS_SETTINGS_KEY)?.value,
      visibility: by.get(MENU_VISIBILITY_SETTINGS_KEY)?.value ?? {},
    }),
    versions: {
      order: versionFromDate(by.get(SIDEBAR_NAV_ORDER_SETTINGS_KEY)?.updatedAt),
      groups: versionFromDate(by.get(SIDEBAR_NAV_GROUPS_SETTINGS_KEY)?.updatedAt),
      visibility: versionFromDate(by.get(MENU_VISIBILITY_SETTINGS_KEY)?.updatedAt),
    },
    modulesOff: modulesOffFromValues(by.get(MODULE_CONTROLS_SETTINGS_KEY)?.value, by.get(FEATURE_VISIBILITY_SETTINGS_KEY)?.value),
    lastChange: last ? { at: last.createdAt.toISOString(), actor: actorLabel(last) } : null,
  };
}

// ───────────────────────────── Doğrulama ─────────────────────────────

/** Gövdedeki rol yapılandırmalarını kayda göre doğrular + budar. Bilinmeyen kimlik → 400. */
export function validateRoles(roles: NavPutBody['roles']): Partial<Record<StudioRole, RoleConfig>> {
  const out: Partial<Record<StudioRole, RoleConfig>> = {};
  const unknown: string[] = [];
  for (const role of STUDIO_ROLES) {
    const cfg = roles[role];
    if (!cfg) continue;
    const order = canonicalizeOrderIds(role, cfg.order);
    const groups = canonicalizeGroupsPayload(role, { groupLabels: cfg.groupLabels, itemGroups: cfg.itemGroups });
    unknown.push(...order.unknown.map((x) => `${role}:${x}`), ...groups.unknown.map((x) => `${role}:${x}`));
    let hidden: string[] = [];
    if (cfg.hidden.length) {
      if (!supportsVisibility(role)) {
        unknown.push(...cfg.hidden.map((k) => `${role}:hidden:${k}`));
      } else {
        const allowed = new Set(getMenuCatalogKeys(role));
        for (const k of cfg.hidden) (allowed.has(k) ? hidden.push(k) : unknown.push(`${role}:hidden:${k}`));
      }
    }
    hidden = Array.from(new Set(hidden));
    out[role] = pruneRoleConfig(role, {
      order: order.value,
      groupLabels: Object.fromEntries(
        Object.entries(groups.value.groupLabels ?? {}).map(([gid, l]) => [gid, toGroupLabel(l)])
      ),
      itemGroups: groups.value.itemGroups ?? {},
      hidden,
    });
  }
  if (unknown.length) {
    throw new ApiError('VALIDATION', 'Menü kaydında olmayan öğe, grup ya da görünürlük anahtarı gönderildi.', {
      details: { unknown: unknown.slice(0, 50) },
    });
  }
  return out;
}

// ───────────────────────────── Yazma ─────────────────────────────

function mergeOrder(prev: unknown, roles: Partial<Record<StudioRole, RoleConfig>>): SidebarNavOrderPayload {
  const next: SidebarNavOrderPayload = { ...normalizeSidebarNavOrder(prev) };
  for (const role of STUDIO_ROLES) {
    const cfg = roles[role];
    if (!cfg) continue;
    if (cfg.order.length) next[role] = cfg.order;
    else delete next[role];
  }
  return next;
}

function mergeGroups(prev: unknown, roles: Partial<Record<StudioRole, RoleConfig>>): SidebarNavGroupsPayload {
  const next: SidebarNavGroupsPayload = { ...normalizeSidebarNavGroups(prev) };
  for (const role of STUDIO_ROLES) {
    const cfg = roles[role];
    if (!cfg) continue;
    const rp: NonNullable<SidebarNavGroupsPayload['admin']> = {};
    if (Object.keys(cfg.groupLabels).length) rp.groupLabels = cfg.groupLabels;
    if (Object.keys(cfg.itemGroups).length) rp.itemGroups = cfg.itemGroups;
    if (rp.groupLabels || rp.itemGroups) next[role] = rp;
    else delete next[role];
  }
  return normalizeSidebarNavGroups(next);
}

function mergeVisibility(prev: unknown, roles: Partial<Record<StudioRole, RoleConfig>>) {
  const next = normalizeMenuVisibility(prev);
  for (const role of ['dealer', 'customer'] as const) {
    const cfg = roles[role];
    if (!cfg) continue;
    const hidden = new Set(cfg.hidden);
    next[role] = Object.fromEntries(getMenuCatalogKeys(role).map((k) => [k, !hidden.has(k)]));
  }
  return next;
}

const stable = (v: unknown) => JSON.stringify(v ?? null);

export interface SaveContext {
  actor: AuditActor;
  request?: { headers: { get(name: string): string | null } } | null;
}

export async function saveNavigation(ctx: SaveContext, body: NavPutBody): Promise<NavStudioState> {
  const roles = validateRoles(body.roles);
  const base = body.baseVersions ?? {};

  const result = await prisma.$transaction(async (tx) => {
    const keys = (Object.keys(KEY_OF) as Array<keyof StudioVersions>).sort((a, b) => KEY_OF[a].localeCompare(KEY_OF[b]));
    const oldData: Obj = {};
    const newData: Obj = {};
    let written = 0;
    for (const part of keys) {
      const key = KEY_OF[part];
      await lockResource(tx, `settings:${key}`);
      const current = await tx.settings.findUnique({ where: { key }, select: { value: true, updatedAt: true } });
      const prevNormalized =
        part === 'order'
          ? normalizeSidebarNavOrder(current?.value)
          : part === 'groups'
            ? normalizeSidebarNavGroups(current?.value)
            : current
              ? normalizeMenuVisibility(current.value)
              : null;
      const next =
        part === 'order' ? mergeOrder(current?.value, roles) : part === 'groups' ? mergeGroups(current?.value, roles) : mergeVisibility(current?.value, roles);
      // Görünürlük satırı yoksa ve kimse gizlenmediyse varsayılan (hepsi açık) — yazmaya gerek yok.
      const unchanged =
        part === 'visibility' && !current
          ? Object.values(next).every((m) => Object.values(m).every(Boolean))
          : stable(prevNormalized) === stable(next);
      if (unchanged) continue;

      const baseVersion = base[part];
      if (!baseVersion) {
        throw new ApiError(BASE_VERSION_REQUIRED_CODE, BASE_VERSION_REQUIRED_MESSAGE, { status: 428 });
      }
      const currentVersion = versionFromDate(current?.updatedAt);
      if (baseVersion !== currentVersion) {
        throw new ApiError(VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE, {
          status: 409,
          details: { key, currentVersion },
        });
      }
      const value = next as unknown as Prisma.InputJsonValue;
      if (current) {
        await tx.settings.update({ where: { key }, data: { value, updatedAt: nextUpdatedAt(current.updatedAt) } });
      } else {
        await tx.settings.create({ data: { key, value, category: 'admin' } });
      }
      oldData[key] = current?.value ?? null;
      newData[key] = next;
      written++;
    }
    if (written > 0) {
      await tx.auditLog.create({
        data: auditEntry(ctx.actor, { action: NAV_PUBLISH_ACTION, entity: 'settings', entityId: 'navigation', oldData, newData }, ctx.request),
      });
    }
    return written;
  });

  if (result > 0) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(NAV_SETTINGS_TAG, 'max');
  }
  return getNavigationState();
}

// ───────────────────────────── Geçmiş ─────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  [NAV_PUBLISH_ACTION]: 'Navigasyon yayınlandı',
  create_sidebar_nav_order: 'Menü sırası (eski sayfa)',
  update_sidebar_nav_order: 'Menü sırası (eski sayfa)',
  create_sidebar_nav_groups: 'Menü grupları (eski sayfa)',
  update_sidebar_nav_groups: 'Menü grupları (eski sayfa)',
  create_menu_visibility: 'Menü görünürlüğü (Ayarlar)',
  update_menu_visibility: 'Menü görünürlüğü (Ayarlar)',
};

/** Denetim satırının `{ [anahtar]: değer }` verisini rol parçalarına çevirir. */
export function partsFromAuditData(data: unknown): Partial<Record<StudioRole, Partial<RoleConfig>>> {
  if (!isObj(data)) return {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(data, k);
  const cfgs = roleConfigsFromValues({
    order: data[SIDEBAR_NAV_ORDER_SETTINGS_KEY],
    groups: data[SIDEBAR_NAV_GROUPS_SETTINGS_KEY],
    visibility: has(MENU_VISIBILITY_SETTINGS_KEY) ? data[MENU_VISIBILITY_SETTINGS_KEY] ?? {} : undefined,
  });
  const out: Partial<Record<StudioRole, Partial<RoleConfig>>> = {};
  for (const role of STUDIO_ROLES) {
    const part: Partial<RoleConfig> = {};
    if (has(SIDEBAR_NAV_ORDER_SETTINGS_KEY)) part.order = cfgs[role].order;
    if (has(SIDEBAR_NAV_GROUPS_SETTINGS_KEY)) {
      part.groupLabels = cfgs[role].groupLabels;
      part.itemGroups = cfgs[role].itemGroups;
    }
    if (has(MENU_VISIBILITY_SETTINGS_KEY) && supportsVisibility(role)) part.hidden = cfgs[role].hidden;
    if (Object.keys(part).length) out[role] = part;
  }
  return out;
}

function describeEntry(oldData: unknown, newData: unknown): string[] {
  const before = partsFromAuditData(oldData);
  const after = partsFromAuditData(newData);
  const lines: string[] = [];
  for (const role of STUDIO_ROLES) {
    const a = after[role];
    if (!a) continue;
    const b = before[role] ?? {};
    // Yalnız bu kayıtta yazılan parçalar karşılaştırılır.
    const empty = emptyRoleConfig();
    const left: RoleConfig = { ...empty };
    const right: RoleConfig = { ...empty, ...a };
    for (const k of Object.keys(a) as Array<keyof RoleConfig>) (left as unknown as Obj)[k] = b[k] ?? empty[k];
    for (const line of describeRoleDiff(role, left, right)) lines.push(`${ROLE_LABEL[role]} · ${line}`);
  }
  return lines;
}

export async function listNavigationHistory(opts: { cursor?: string; limit: number }): Promise<NavHistoryPage> {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: NAV_HISTORY_ACTIONS } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      createdAt: true,
      oldData: true,
      newData: true,
      actorSnapshot: true,
      user: { select: { name: true, email: true } },
    },
  });
  const page = rows.slice(0, opts.limit);
  const entries: NavHistoryEntry[] = page.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actor: actorLabel(r),
    actionLabel: ACTION_LABEL[r.action] ?? r.action,
    changes: describeEntry(r.oldData, r.newData),
    snapshot: partsFromAuditData(r.newData),
  }));
  return { entries, nextCursor: rows.length > opts.limit ? page[page.length - 1]?.id ?? null : null };
}
