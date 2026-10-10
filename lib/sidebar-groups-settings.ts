import type { Prisma } from '@prisma/client';

/**
 * Sidebar grup override sistemi — admin'in sol menü GRUPLARINI düzenlemesini sağlar.
 * Kayıtta (`lib/navigation/registry.ts` → `NAV_GROUPS`) tanımlı grupların ÜSTÜNE oturur:
 *   - `groupLabels`: grup başlığı. `{ tr, en }` (tercih edilen) ya da eski düz metin
 *     (iki dilde de aynı görünür — B12.2 geriye uyum).
 *   - `itemGroups`: bir menü öğesinin (kayıt kimliği; eski `key/href` kimlikleri
 *     okumada göç eder) hangi gruba ait olduğunu değiştirir ('' = grupsuz üst düzey).
 * Sıralama ayrı `sidebarNavOrder` sistemiyle yönetilir; bu dosya yalnızca grubu belirler.
 * Admin rolü de dahildir (B1: admin menüsü 10 alana gruplandı).
 */

export const SIDEBAR_NAV_GROUPS_SETTINGS_KEY = 'sidebarNavGroups';

export const SIDEBAR_GROUP_ROLES = ['admin', 'dealer', 'customer'] as const;
export type SidebarGroupRole = (typeof SIDEBAR_GROUP_ROLES)[number];

export type SidebarGroupLabel = string | { tr?: string; en?: string };

export type SidebarGroupsRolePayload = {
  /** grupKimliği → başlık */
  groupLabels?: Record<string, SidebarGroupLabel>;
  /** menü öğesi kimliği → grupKimliği (boş string = grupsuz) */
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

function normalizeLabelMap(raw: unknown, maxLen: number): Record<string, SidebarGroupLabel> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, SidebarGroupLabel> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k.length === 0 || k.length > 200) continue;
    if (typeof v === 'string') {
      if (v.length <= maxLen) out[k] = v;
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const label: { tr?: string; en?: string } = {};
      if (typeof o.tr === 'string' && o.tr.length <= maxLen && o.tr.trim()) label.tr = o.tr;
      if (typeof o.en === 'string' && o.en.length <= maxLen && o.en.trim()) label.en = o.en;
      if (label.tr || label.en) out[k] = label;
    }
  }
  return out;
}

export function normalizeSidebarNavGroups(raw: unknown): SidebarNavGroupsPayload {
  const empty = getDefaultSidebarNavGroups();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const src = raw as Record<string, unknown>;
  const out: SidebarNavGroupsPayload = {};
  for (const role of SIDEBAR_GROUP_ROLES) {
    const rp = src[role];
    if (!rp || typeof rp !== 'object' || Array.isArray(rp)) continue;
    const rpObj = rp as Record<string, unknown>;
    const groupLabels = normalizeLabelMap(rpObj.groupLabels, 60);
    const itemGroups = normalizeStringMap(rpObj.itemGroups, 200); // değer = grupKimliği (boş = grupsuz)
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
