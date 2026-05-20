import type { Prisma } from '@prisma/client';

export const SIDEBAR_NAV_ORDER_SETTINGS_KEY = 'sidebarNavOrder';

export type SidebarRole = 'admin' | 'dealer' | 'customer';

export type SidebarNavOrderPayload = Partial<Record<SidebarRole, string[]>>;

export function getDefaultSidebarNavOrder(): SidebarNavOrderPayload {
  return {};
}

/** Menü öğesi kimliği: key varsa key, yoksa href (admin’de bazı satırlarda key yok). */
export function navOrderId(item: { key?: string; href: string }): string {
  return item.key ?? item.href;
}

export function normalizeSidebarNavOrder(raw: unknown): SidebarNavOrderPayload {
  const empty = getDefaultSidebarNavOrder();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const src = raw as Record<string, unknown>;
  const out: SidebarNavOrderPayload = {};
  for (const role of ['admin', 'dealer', 'customer'] as const) {
    const arr = src[role];
    if (!Array.isArray(arr)) continue;
    const ids = arr.filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (ids.length) out[role] = ids;
  }
  return out;
}

export function applySidebarOrder<T extends { key?: string; href: string }>(
  items: T[],
  orderIds: string[] | undefined | null
): T[] {
  if (!orderIds?.length) return items;
  const idFn = (i: T) => navOrderId(i);
  const map = new Map(items.map((i) => [idFn(i), i]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const oid of orderIds) {
    const it = map.get(oid);
    if (it) {
      out.push(it);
      seen.add(oid);
    }
  }
  for (const it of items) {
    const iid = idFn(it);
    if (!seen.has(iid)) out.push(it);
  }
  return out;
}

export function orderPayloadForAudit(payload: SidebarNavOrderPayload): Prisma.InputJsonValue {
  return payload as unknown as Prisma.InputJsonValue;
}
