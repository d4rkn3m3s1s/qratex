import type { Prisma } from '@prisma/client';

/**
 * Sidebar grup override sistemi — admin'in sol menü GRUPLARINI düzenlemesini sağlar.
 * Kodda tanımlı varsayılan grupların ÜSTÜNE oturur (bozmaz):
 *   - `groupLabels`: grup başlığı metnini override eder (i18n yerine düz metin).
 *   - `itemGroups`: bir menü öğesinin (navOrderId) hangi gruba ait olduğunu değiştirir
 *     (null/'' = grupsuz üst düzeye taşı).
 * Sıralama ayrı `sidebarNavOrder` sistemiyle yönetilir; bu dosya yalnızca grubu belirler.
 */

export const SIDEBAR_NAV_GROUPS_SETTINGS_KEY = 'sidebarNavGroups';

export type SidebarGroupRole = 'dealer' | 'customer';

export type SidebarGroupsRolePayload = {
  /** grupKey → override edilmiş başlık metni */
  groupLabels?: Record<string, string>;
  /** navOrderId → grupKey (boş string = grupsuz) */
  itemGroups?: Record<string, string>;
};

export type SidebarNavGroupsPayload = Partial<Record<SidebarGroupRole, SidebarGroupsRolePayload>>;

export function getDefaultSidebarNavGroups(): SidebarNavGroupsPayload {
  return {};
}

function normalizeStringMap(raw: unknown, maxLen: number): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof k !== 'string' || k.length === 0 || k.length > 200) continue;
    if (typeof v !== 'string' || v.length > maxLen) continue;
    out[k] = v;
  }
  return out;
}

export function normalizeSidebarNavGroups(raw: unknown): SidebarNavGroupsPayload {
  const empty = getDefaultSidebarNavGroups();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const src = raw as Record<string, unknown>;
  const out: SidebarNavGroupsPayload = {};
  for (const role of ['dealer', 'customer'] as const) {
    const rp = src[role];
    if (!rp || typeof rp !== 'object' || Array.isArray(rp)) continue;
    const rpObj = rp as Record<string, unknown>;
    const groupLabels = normalizeStringMap(rpObj.groupLabels, 60);
    const itemGroups = normalizeStringMap(rpObj.itemGroups, 200); // değer = grupKey (boş = grupsuz)
    if (Object.keys(groupLabels).length || Object.keys(itemGroups).length) {
      out[role] = {};
      if (Object.keys(groupLabels).length) out[role]!.groupLabels = groupLabels;
      if (Object.keys(itemGroups).length) out[role]!.itemGroups = itemGroups;
    }
  }
  return out;
}

export function groupsPayloadForAudit(payload: SidebarNavGroupsPayload): Prisma.InputJsonValue {
  return payload as unknown as Prisma.InputJsonValue;
}
