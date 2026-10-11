/**
 * Navigasyon Stüdyosu (/admin/navigation) — istemci + sunucu ortak sözleşme (SAF; DB yok).
 *
 * Tek yüzey üç ayarı birlikte düzenler (eski /admin/sidebar-order + /admin/menu-groups +
 * ayarlar sayfasındaki menü görünürlüğü):
 *   - `order`       → Settings.sidebarNavOrder[rol]   (kayıt kimlikleri, sıra)
 *   - `groupLabels` → Settings.sidebarNavGroups[rol].groupLabels  ({ tr, en })
 *   - `itemGroups`  → Settings.sidebarNavGroups[rol].itemGroups   (öğe → grup; '' = grupsuz)
 *   - `hidden`      → Settings.menuVisibility[rol]  (yalnız bayi/müşteri; menuKey listesi)
 *
 * Kimlik uzayı `lib/navigation/registry.ts`'tir. Varsayılana eşit değerler SAKLANMAZ
 * (`pruneRoleConfig`) — kayıt değiştiğinde dondurulmuş eski atamalar yeni varsayılanı ezmesin.
 */
import { z } from 'zod';
import { groupsForRole, isDynamicHref, routesForRole, type Bilingual, type NavRoute } from '@/lib/navigation/registry';

export const STUDIO_ROLES = ['admin', 'dealer', 'customer'] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];
export type VisibilityStudioRole = 'dealer' | 'customer';

export const ROLE_LABEL: Record<StudioRole, string> = { admin: 'Admin', dealer: 'Bayi', customer: 'Müşteri' };

export function supportsVisibility(role: StudioRole): role is VisibilityStudioRole {
  return role === 'dealer' || role === 'customer';
}

export type GroupLabel = { tr?: string; en?: string };

export interface RoleConfig {
  /** Kayıt kimlikleri; boş = kayıt sırası. */
  order: string[];
  groupLabels: Record<string, GroupLabel>;
  /** öğe kimliği → grup kimliği ('' = grupsuz üst düzey). */
  itemGroups: Record<string, string>;
  /** Gizlenen menü anahtarları (menuKey), sıralı. */
  hidden: string[];
}

export type StudioVersions = { order: string; groups: string; visibility: string };

export interface NavStudioState {
  roles: Record<StudioRole, RoleConfig>;
  versions: StudioVersions;
  /** Modül kapısı/özellik görünürlüğü yüzünden kapalı modül anahtarları (salt okunur). */
  modulesOff: Record<VisibilityStudioRole, string[]>;
  lastChange: { at: string; actor: string } | null;
}

export interface NavHistoryEntry {
  id: string;
  at: string;
  actor: string;
  actionLabel: string;
  changes: string[];
  /** Bu sürümde yazılan değerlerden geri yüklenebilecek roller → parçalar. */
  snapshot: Partial<Record<StudioRole, Partial<RoleConfig>>>;
}

export interface NavHistoryPage {
  entries: NavHistoryEntry[];
  nextCursor: string | null;
}

// ───────────────────────────── Kayıt yardımcıları ─────────────────────────────

/** Menüde sıralanabilen öğeler: üst düzey `primary` + bir üst sayfanın altındaki `secondary`. */
export function orderableRoutes(role: StudioRole): NavRoute[] {
  return routesForRole(role).filter(
    (r) => !isDynamicHref(r.href) && ((r.status === 'primary' && !r.parent) || (r.status === 'secondary' && !!r.parent))
  );
}

export function defaultOrder(role: StudioRole): string[] {
  return orderableRoutes(role).map((r) => r.id);
}

/** Kayıtlı sıra + kayıtta olup listede olmayanlar (kayıt sırasıyla sona) — kabuktaki `applyOrder` ile aynı. */
export function effectiveOrder(role: StudioRole, order: readonly string[]): string[] {
  const all = defaultOrder(role);
  const known = new Set(all);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of all) if (!seen.has(id)) out.push(id);
  return out;
}

export function groupLabelDefault(role: StudioRole, gid: string): Bilingual | undefined {
  return groupsForRole(role).find((g) => g.id === gid)?.label;
}

export function emptyRoleConfig(): RoleConfig {
  return { order: [], groupLabels: {}, itemGroups: {}, hidden: [] };
}

/** Varsayılana eşit değerleri düşürür, kimlikleri tekilleştirir (saf, deterministik). */
export function pruneRoleConfig(role: StudioRole, cfg: RoleConfig): RoleConfig {
  const routes = new Map(orderableRoutes(role).map((r) => [r.id, r]));
  const eff = effectiveOrder(role, cfg.order);
  const def = defaultOrder(role);
  const order = eff.length === def.length && eff.every((id, i) => id === def[i]) ? [] : eff;

  const groupLabels: Record<string, GroupLabel> = {};
  for (const [gid, label] of Object.entries(cfg.groupLabels)) {
    const base = groupLabelDefault(role, gid);
    if (!base) continue;
    const tr = label.tr?.trim();
    const en = label.en?.trim();
    const out: GroupLabel = {};
    if (tr && tr !== base.tr) out.tr = tr;
    if (en && en !== base.en) out.en = en;
    if (out.tr || out.en) groupLabels[gid] = out;
  }

  const itemGroups: Record<string, string> = {};
  for (const [id, gid] of Object.entries(cfg.itemGroups)) {
    const r = routes.get(id);
    if (!r || r.parent) continue;
    if ((r.group ?? '') !== gid) itemGroups[id] = gid;
  }

  const hidden = supportsVisibility(role) ? Array.from(new Set(cfg.hidden)).sort() : [];
  return { order, groupLabels: sortKeys(groupLabels), itemGroups: sortKeys(itemGroups), hidden };
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

export function sameRoleConfig(role: StudioRole, a: RoleConfig, b: RoleConfig): boolean {
  return JSON.stringify(pruneRoleConfig(role, a)) === JSON.stringify(pruneRoleConfig(role, b));
}

/** Öğenin etkin grubu (atama yoksa kayıttaki grup). */
export function effectiveGroup(route: NavRoute, cfg: RoleConfig): string {
  return Object.prototype.hasOwnProperty.call(cfg.itemGroups, route.id) ? cfg.itemGroups[route.id] : route.group ?? '';
}

/** İki yapılandırma arasındaki farkın insan okunur özeti (fark çekmecesi + geçmiş). */
export function describeRoleDiff(role: StudioRole, before: RoleConfig, after: RoleConfig): string[] {
  const a = pruneRoleConfig(role, before);
  const b = pruneRoleConfig(role, after);
  const routes = new Map(orderableRoutes(role).map((r) => [r.id, r]));
  const name = (id: string) => routes.get(id)?.label.tr ?? id;
  const groupName = (gid: string) => (gid ? groupLabelDefault(role, gid)?.tr ?? gid : 'Grupsuz');
  const lines: string[] = [];

  const ea = effectiveOrder(role, a.order);
  const eb = effectiveOrder(role, b.order);
  const moved = eb.filter((id, i) => ea[i] !== id).length;
  if (moved > 0) lines.push(`Sıra: ${moved} konum değişti`);

  for (const id of new Set([...Object.keys(a.itemGroups), ...Object.keys(b.itemGroups)])) {
    const r = routes.get(id);
    if (!r) continue;
    const ga = effectiveGroup(r, a);
    const gb = effectiveGroup(r, b);
    if (ga !== gb) lines.push(`${name(id)}: ${groupName(ga)} → ${groupName(gb)}`);
  }

  for (const gid of new Set([...Object.keys(a.groupLabels), ...Object.keys(b.groupLabels)])) {
    const la = a.groupLabels[gid] ?? {};
    const lb = b.groupLabels[gid] ?? {};
    if ((la.tr ?? '') !== (lb.tr ?? '') || (la.en ?? '') !== (lb.en ?? '')) {
      const base = groupLabelDefault(role, gid);
      lines.push(`Grup adı “${base?.tr ?? gid}”: ${lb.tr || lb.en ? [lb.tr, lb.en].filter(Boolean).join(' / ') : 'varsayılana döndü'}`);
    }
  }

  const ha = new Set(a.hidden);
  const hb = new Set(b.hidden);
  const byKey = new Map(routesForRole(role).filter((r) => r.menuKey).map((r) => [r.menuKey as string, r.label.tr]));
  for (const k of hb) if (!ha.has(k)) lines.push(`Gizlendi: ${byKey.get(k) ?? k}`);
  for (const k of ha) if (!hb.has(k)) lines.push(`Gösterildi: ${byKey.get(k) ?? k}`);
  return lines;
}

// ───────────────────────────── Şema ─────────────────────────────

const idSchema = z.string().trim().min(1).max(200);
const labelSchema = z
  .object({
    tr: z.string().trim().max(60, 'Grup adı en çok 60 karakter olabilir.').optional(),
    en: z.string().trim().max(60, 'Group name can be at most 60 characters.').optional(),
  })
  .strict();

export const roleConfigSchema = z
  .object({
    order: z.array(idSchema).max(400),
    groupLabels: z.record(z.string().min(1).max(64), labelSchema),
    itemGroups: z.record(idSchema, z.string().max(64)),
    hidden: z.array(z.string().trim().min(1).max(100)).max(300),
  })
  .strict();

export const navPutBodySchema = z
  .object({
    roles: z
      .object({ admin: roleConfigSchema.optional(), dealer: roleConfigSchema.optional(), customer: roleConfigSchema.optional() })
      .strict()
      .refine((r) => !!(r.admin || r.dealer || r.customer), 'En az bir rol gönderilmeli.'),
    /** C2 iyimser kilit: her ayar anahtarının istemcinin gördüğü sürümü. Eksikse 428. */
    baseVersions: z
      .object({ order: z.string().min(1).max(200), groups: z.string().min(1).max(200), visibility: z.string().min(1).max(200) })
      .partial()
      .optional(),
  })
  .strict();

export type NavPutBody = z.infer<typeof navPutBodySchema>;

export const navHistoryQuerySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
