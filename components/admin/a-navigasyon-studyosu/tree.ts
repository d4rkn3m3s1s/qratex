/**
 * Navigasyon Stüdyosu — düzenleyici ağacı (SAF). Kabuğun (`buildShellConfig`) kuralını aynen
 * izler: üst düzey öğeler etkin sırada; bir grup, ilk üyesinin konumunda belirir; alt sayfalar
 * üst sayfanın altında kendi aralarında sıralıdır. Her taşıma ağacı yeniden düzleştirip
 * tek `order` listesi üretir — böylece "öğeyi gruba taşıyınca grup yer değiştirdi" yan etkisi
 * oluşmaz (öğe hedef grubun SONUNA yerleşir).
 */
import type { NavRoute } from '@/lib/navigation/registry';
import { effectiveGroup, effectiveOrder, orderableRoutes, type RoleConfig, type StudioRole } from '@/lib/admin-navigation/contract';

export type EditorItem = { route: NavRoute; children: NavRoute[] };
export type EditorNode =
  | { kind: 'item'; key: string; item: EditorItem }
  | { kind: 'group'; key: string; groupId: string; items: EditorItem[] };

export function buildEditorNodes(role: StudioRole, cfg: RoleConfig, extraGroups: readonly string[] = []): EditorNode[] {
  const routes = new Map(orderableRoutes(role).map((r) => [r.id, r]));
  const order = effectiveOrder(role, cfg.order);
  const childrenOf = new Map<string, NavRoute[]>();
  for (const id of order) {
    const r = routes.get(id);
    if (r?.parent) childrenOf.set(r.parent, [...(childrenOf.get(r.parent) ?? []), r]);
  }
  const nodes: EditorNode[] = [];
  const groupIdx = new Map<string, number>();
  for (const id of order) {
    const r = routes.get(id);
    if (!r || r.parent) continue;
    const item: EditorItem = { route: r, children: childrenOf.get(r.id) ?? [] };
    const gid = effectiveGroup(r, cfg);
    if (!gid) {
      nodes.push({ kind: 'item', key: r.id, item });
      continue;
    }
    const at = groupIdx.get(gid);
    if (at == null) {
      groupIdx.set(gid, nodes.length);
      nodes.push({ kind: 'group', key: `g:${gid}`, groupId: gid, items: [item] });
    } else {
      const n = nodes[at];
      if (n.kind === 'group') n.items.push(item);
    }
  }
  // Üyesi kalmamış gruplar da (yeniden doldurulabilsin diye) boş kart olarak sonda görünür.
  for (const gid of extraGroups) {
    if (!groupIdx.has(gid)) nodes.push({ kind: 'group', key: `g:${gid}`, groupId: gid, items: [] });
  }
  return nodes;
}

export function flattenNodes(nodes: readonly EditorNode[]): string[] {
  const out: string[] = [];
  const push = (it: EditorItem) => {
    out.push(it.route.id);
    for (const c of it.children) out.push(c.id);
  };
  for (const n of nodes) {
    if (n.kind === 'item') push(n.item);
    else n.items.forEach(push);
  }
  return out;
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Üst düzey düğümü (öğe ya da bütün grup) bir adım yukarı/aşağı taşır. */
export function moveNode(nodes: EditorNode[], index: number, dir: -1 | 1): EditorNode[] {
  return swap(nodes, index, index + dir);
}

/** Grup içindeki öğeyi bir adım taşır. */
export function moveInGroup(nodes: EditorNode[], nodeIndex: number, itemIndex: number, dir: -1 | 1): EditorNode[] {
  const n = nodes[nodeIndex];
  if (!n || n.kind !== 'group') return nodes;
  const next = nodes.slice();
  next[nodeIndex] = { ...n, items: swap(n.items, itemIndex, itemIndex + dir) };
  return next;
}

/** Alt sayfayı kardeşleri arasında bir adım taşır. */
export function moveChild(nodes: EditorNode[], parentId: string, childIndex: number, dir: -1 | 1): EditorNode[] {
  const fix = (it: EditorItem): EditorItem =>
    it.route.id === parentId ? { ...it, children: swap(it.children, childIndex, childIndex + dir) } : it;
  return nodes.map((n) => (n.kind === 'item' ? { ...n, item: fix(n.item) } : { ...n, items: n.items.map(fix) }));
}

/**
 * Öğeyi başka gruba (ya da '' = grupsuz) taşır: öğe bulunduğu yerden çıkar; hedef grup
 * varsa onun SONUNA, yoksa (grupsuz ya da boş grup) çıktığı düğümün hemen ARKASINA yerleşir.
 */
export function moveToGroup(nodes: EditorNode[], itemId: string, targetGroup: string): EditorNode[] {
  let moved: EditorItem | null = null;
  let fromIndex = -1;
  const without: EditorNode[] = [];
  nodes.forEach((n) => {
    if (n.kind === 'item') {
      if (n.item.route.id === itemId) {
        moved = n.item;
        fromIndex = without.length;
        return;
      }
      without.push(n);
      return;
    }
    const idx = n.items.findIndex((it) => it.route.id === itemId);
    if (idx >= 0) {
      moved = n.items[idx];
      fromIndex = without.length + 1;
      without.push({ ...n, items: n.items.filter((_, k) => k !== idx) });
      return;
    }
    without.push(n);
  });
  if (!moved) return nodes;
  const item = moved as EditorItem;
  if (targetGroup) {
    const gi = without.findIndex((n) => n.kind === 'group' && n.groupId === targetGroup);
    if (gi >= 0) {
      const g = without[gi] as Extract<EditorNode, { kind: 'group' }>;
      without[gi] = { ...g, items: [...g.items, item] };
      return without;
    }
    without.splice(Math.max(0, fromIndex), 0, { kind: 'group', key: `g:${targetGroup}`, groupId: targetGroup, items: [item] });
    return without;
  }
  without.splice(Math.max(0, fromIndex), 0, { kind: 'item', key: item.route.id, item });
  return without;
}
