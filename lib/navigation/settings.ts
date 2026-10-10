/**
 * Admin menü özelleştirmesi (sıra + grup) ↔ kayıt kimlikleri.
 *
 * DB'de eski sidebar'ın kimlikleri (`key ?? href`) durabilir; okurken ve yazarken
 * hepsi kayıt kimliğine (`NavRoute.id`) çevrilir. Böylece Navigasyon Stüdyosu ve
 * kabuk aynı kimlik uzayında çalışır; çözülemeyen kimlikler reddedilir (varsayılan reddet).
 */
import { groupsForRole, resolveRouteId, type NavRole } from './registry';
import type { SidebarGroupsRolePayload } from '@/lib/sidebar-groups-settings';

export type CanonicalResult<T> = { value: T; unknown: string[] };

/** Sıra listesi → kayıt kimlikleri (tekrarlar düşer, sıra korunur). */
export function canonicalizeOrderIds(role: NavRole, ids: readonly string[]): CanonicalResult<string[]> {
  const value: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = resolveRouteId(role, raw);
    if (!id) {
      unknown.push(raw);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    value.push(id);
  }
  return { value, unknown };
}

/**
 * Grup payload'ı → kayıt kimlikleri. Bilinmeyen öğe kimliği ya da kayıtta olmayan
 * grup kimliği `unknown`'a düşer (`group:<id>` / `item:<id>` önekiyle).
 */
export function canonicalizeGroupsPayload(
  role: NavRole,
  payload: SidebarGroupsRolePayload
): CanonicalResult<SidebarGroupsRolePayload> {
  const groupIds = new Set(groupsForRole(role).map((g) => g.id));
  const unknown: string[] = [];
  const out: SidebarGroupsRolePayload = {};

  if (payload.groupLabels) {
    const labels: NonNullable<SidebarGroupsRolePayload['groupLabels']> = {};
    for (const [gid, label] of Object.entries(payload.groupLabels)) {
      if (!groupIds.has(gid)) {
        unknown.push(`group:${gid}`);
        continue;
      }
      labels[gid] = label;
    }
    if (Object.keys(labels).length) out.groupLabels = labels;
  }

  if (payload.itemGroups) {
    const items: Record<string, string> = {};
    for (const [rawId, gid] of Object.entries(payload.itemGroups)) {
      const id = resolveRouteId(role, rawId);
      if (!id) {
        unknown.push(`item:${rawId}`);
        continue;
      }
      if (gid !== '' && !groupIds.has(gid)) {
        unknown.push(`group:${gid}`);
        continue;
      }
      items[id] = gid;
    }
    if (Object.keys(items).length) out.itemGroups = items;
  }

  return { value: out, unknown };
}
