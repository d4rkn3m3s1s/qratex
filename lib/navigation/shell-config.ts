/**
 * Kabuk yapılandırması — kayıt + DB ayarları → sidebar / alt sekme / ⌘K verisi.
 *
 * SAF modül: DB'ye dokunmaz (yükleme `get-shell-config.ts`'te). Çıktı tamamen
 * serileştirilebilir; RSC layout'tan istemci kabuğuna prop olarak geçer. Böylece
 * istemci menü için ağ isteği atmaz, gizli öğe "önce görünüp sonra kaybolmaz" (B8).
 */
import {
  PALETTE_STATUSES,
  groupsForRole,
  hrefPatternMatches,
  isDynamicHref,
  resolveRouteId,
  routesForRole,
  shortcutsForRole,
  type Bilingual,
  type NavBadgeKey,
  type NavIconName,
  type NavRole,
  type NavRoute,
  type NavShortcut,
} from './registry';

export type GroupLabelOverride = string | { tr?: string; en?: string };

export interface NavSettingsSnapshot {
  /** Bu rolün kayıtlı sıra listesi (eski ya da yeni kimlikler). */
  order?: string[] | null;
  groups?: {
    groupLabels?: Record<string, GroupLabelOverride>;
    itemGroups?: Record<string, string>;
  } | null;
  /** Bu rolün menü görünürlüğü (katalog anahtarı → açık mı). */
  menuVisibility?: Record<string, boolean> | null;
  /** Bu rolün özellik görünürlüğü (modül anahtarı → açık mı). */
  featureVisibility?: Record<string, boolean> | null;
  /** Küresel modül kontrolleri. */
  moduleControls?: Record<string, boolean> | null;
}

export interface ShellItem {
  id: string;
  href: string;
  label: Bilingual;
  icon: NavIconName;
  badge?: NavBadgeKey;
  teamOnly?: boolean;
  children: ShellItem[];
}

export type ShellNode =
  | { kind: 'item'; item: ShellItem }
  | { kind: 'group'; id: string; label: Bilingual; icon: NavIconName; items: ShellItem[] };

export interface ShellTab {
  id: string;
  href: string;
  label: Bilingual;
  icon: NavIconName;
  fab?: boolean;
}

export interface PaletteEntry {
  id: string;
  href: string;
  label: Bilingual;
  icon: NavIconName;
  /** Bağlam (grup ya da üst sayfa adı). */
  section?: Bilingual;
  keywords: string[];
  teamOnly?: boolean;
}

export type ShellShortcut = Pick<NavShortcut, 'id' | 'label' | 'icon' | 'href' | 'action' | 'hint'> & {
  keywords: string[];
};

/**
 * Sayfa düzeyi erişim kapısı (B11): menüden gizlenen ya da modülü kapalı rota URL'den
 * (yer imi, bildirim, Qra yanıtı) açılınca da "kullanılamıyor" durumu gösterilir.
 * `blocked` ve `open` rolün kayıttaki tüm rota desenleri; yola EN ÖZGÜL eşleşen desen
 * `blocked`'daysa sayfa kapalıdır. Admin/personel için ikisi de boş (kapı yok).
 */
export interface RouteGate {
  blocked: string[];
  open: string[];
}

export interface ShellConfig {
  role: NavRole;
  homeHref: string;
  nodes: ShellNode[];
  bottomTabs: ShellTab[];
  palette: PaletteEntry[];
  shortcuts: ShellShortcut[];
  links: { settings?: string; me?: string; scan?: string; assistant?: string };
  gate: RouteGate;
}

const ROLE_HOME: Record<NavRole, string> = {
  customer: '/customer',
  dealer: '/dealer',
  admin: '/admin',
  staff: '/staff',
};

/** Görünürlük ayarları yalnız bayi/müşteri menüsüne uygulanır (admin her şeyi görür ki geri açabilsin). */
function isRouteEnabled(route: NavRoute, s: NavSettingsSnapshot): boolean {
  if (route.role !== 'dealer' && route.role !== 'customer') return true;
  if (route.menuKey && s.menuVisibility?.[route.menuKey] === false) return false;
  if (route.moduleKey) {
    if (s.featureVisibility?.[route.moduleKey] === false) return false;
    if (s.moduleControls?.[route.moduleKey] === false) return false;
  }
  return true;
}

/** Bir rota ve tüm ataları açık mı? */
function buildEnabledSet(role: NavRole, s: NavSettingsSnapshot): Set<string> {
  const routes = routesForRole(role);
  const byId = new Map(routes.map((r) => [r.id, r]));
  const enabled = new Set<string>();
  for (const r of routes) {
    let cur: NavRoute | undefined = r;
    let ok = true;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (!isRouteEnabled(cur, s)) {
        ok = false;
        break;
      }
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    if (ok) enabled.add(r.id);
  }
  return enabled;
}

function applyOrder<T extends { id: string }>(items: T[], orderIds: string[]): T[] {
  if (!orderIds.length) return items;
  const rank = new Map(orderIds.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ra = rank.get(a.item.id);
      const rb = rank.get(b.item.id);
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

function resolveLabel(base: Bilingual, override: GroupLabelOverride | undefined): Bilingual {
  if (override == null) return base;
  if (typeof override === 'string') {
    const v = override.trim();
    return v ? { tr: v, en: v } : base;
  }
  return {
    tr: override.tr?.trim() || base.tr,
    en: override.en?.trim() || base.en,
  };
}

/** Desenin yolu kapsaması: tam/dinamik eşleşme ya da statik desenin alt yolu. */
function patternCovers(pattern: string, pathname: string): boolean {
  if (hrefPatternMatches(pattern, pathname)) return true;
  return !isDynamicHref(pattern) && pathname.startsWith(pattern.endsWith('/') ? pattern : `${pattern}/`);
}

/** Özgüllük: bölüm sayısı, eşitlikte statik bölümü fazla olan. */
function specificity(pattern: string): number {
  const segs = pattern.split('/').filter(Boolean);
  return segs.length * 100 + segs.filter((s) => !s.startsWith('[')).length;
}

/**
 * Yol bu kabukta kapalı mı? Yola eşleşen EN ÖZGÜL kayıt deseni `blocked`'daysa evet
 * (ör. `/dealer/analytics` gizliyken `/dealer/analytics/heatmap` kendi anahtarıyla açık kalır).
 * Saf; istemci kapısı ve test kullanır.
 */
export function isRouteBlocked(gate: RouteGate | null | undefined, pathname: string): boolean {
  if (!gate || !gate.blocked.length) return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  let best: { pattern: string; blocked: boolean } | null = null;
  const consider = (pattern: string, blocked: boolean) => {
    if (!patternCovers(pattern, path)) return;
    if (!best || specificity(pattern) > specificity(best.pattern)) best = { pattern, blocked };
  };
  gate.open.forEach((p) => consider(p, false));
  gate.blocked.forEach((p) => consider(p, true));
  return (best as { pattern: string; blocked: boolean } | null)?.blocked ?? false;
}

/** Hiçbir ayarla kapatılamayan rotalar: rol ana sayfası ve ayarlar (hesap/abonelik/KVKK erişimi). */
const NEVER_BLOCKED = new Set(['customer.home', 'customer.me.settings', 'dealer.today', 'dealer.settings']);

/** DB sıra listesini kayıt kimliklerine çevirir (eski kimlikler göç eder, tekrarlar düşer). */
export function canonicalOrder(role: NavRole, raw: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw ?? []) {
    const resolved = resolveRouteId(role, id);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
  }
  return out;
}

export function buildShellConfig(role: NavRole, snapshot: NavSettingsSnapshot = {}): ShellConfig {
  const routes = routesForRole(role);
  const byId = new Map(routes.map((r) => [r.id, r]));
  const enabled = buildEnabledSet(role, snapshot);
  const order = canonicalOrder(role, snapshot.order);
  const groupDefs = groupsForRole(role);
  const groupIds = new Set(groupDefs.map((g) => g.id));

  // Admin grup ataması: kayıt kimliğine çevrilir; bilinmeyen grup kimliği yok sayılır.
  const itemGroupOverride = new Map<string, string>();
  for (const [rawId, gid] of Object.entries(snapshot.groups?.itemGroups ?? {})) {
    const id = resolveRouteId(role, rawId);
    if (!id) continue;
    if (gid === '' || groupIds.has(gid)) itemGroupOverride.set(id, gid);
  }
  const groupLabelOverride = snapshot.groups?.groupLabels ?? {};

  const toItem = (r: NavRoute): ShellItem => {
    const children = applyOrder(
      routes.filter((c) => c.parent === r.id && c.status === 'secondary' && enabled.has(c.id) && !isDynamicHref(c.href)),
      order
    ).map(toItem);
    return {
      id: r.id,
      href: r.href,
      label: r.label,
      icon: r.icon,
      ...(r.badge ? { badge: r.badge } : {}),
      ...(r.teamOnly ? { teamOnly: true } : {}),
      children,
    };
  };

  const primaries = applyOrder(
    routes.filter((r) => r.status === 'primary' && !r.parent && enabled.has(r.id) && !isDynamicHref(r.href)),
    order
  );

  const nodes: ShellNode[] = [];
  const groupIndex = new Map<string, number>();
  for (const r of primaries) {
    const gid = itemGroupOverride.has(r.id) ? itemGroupOverride.get(r.id) || undefined : r.group;
    const def = gid ? groupDefs.find((g) => g.id === gid) : undefined;
    const item = toItem(r);
    if (!def) {
      nodes.push({ kind: 'item', item });
      continue;
    }
    const idx = groupIndex.get(def.id);
    if (idx == null) {
      groupIndex.set(def.id, nodes.length);
      nodes.push({
        kind: 'group',
        id: def.id,
        label: resolveLabel(def.label, groupLabelOverride[def.id]),
        icon: def.icon,
        items: [item],
      });
    } else {
      const node = nodes[idx];
      if (node.kind === 'group') node.items.push(item);
    }
  }

  const bottomTabs: ShellTab[] = routes
    .filter((r) => r.bottomTab != null && enabled.has(r.id))
    .sort((a, b) => (a.bottomTab ?? 0) - (b.bottomTab ?? 0))
    .map((r) => ({ id: r.id, href: r.href, label: r.label, icon: r.icon, ...(r.bottomFab ? { fab: true } : {}) }));

  const sectionFor = (r: NavRoute): Bilingual | undefined => {
    if (r.parent) return byId.get(r.parent)?.label;
    const gid = itemGroupOverride.has(r.id) ? itemGroupOverride.get(r.id) || undefined : r.group;
    const def = gid ? groupDefs.find((g) => g.id === gid) : undefined;
    return def ? resolveLabel(def.label, groupLabelOverride[def.id]) : undefined;
  };

  const palette: PaletteEntry[] = routes
    .filter((r) => PALETTE_STATUSES.has(r.status) && enabled.has(r.id) && !isDynamicHref(r.href))
    .map((r) => {
      const section = sectionFor(r);
      return {
        id: r.id,
        href: r.tab ? `${r.href}?tab=${r.tab}` : r.href,
        label: r.label,
        icon: r.icon,
        ...(section ? { section } : {}),
        keywords: r.keywords ?? [],
        ...(r.teamOnly ? { teamOnly: true } : {}),
      };
    });

  const shortcuts: ShellShortcut[] = shortcutsForRole(role)
    .filter((sc) => {
      if (!sc.href) return true;
      // Kısayolun hedefi gizlenmiş bir rotaysa kısayol da düşer.
      const target = routes.find((r) => r.href === sc.href);
      return !target || enabled.has(target.id);
    })
    .map((sc) => ({
      id: sc.id,
      label: sc.label,
      icon: sc.icon,
      ...(sc.href ? { href: sc.href } : {}),
      ...(sc.action ? { action: sc.action } : {}),
      ...(sc.hint ? { hint: sc.hint } : {}),
      keywords: sc.keywords ?? [],
    }));

  const hrefIfEnabled = (id: string) => (enabled.has(id) ? byId.get(id)?.href : undefined);
  const links: ShellConfig['links'] = {};
  if (role === 'customer') {
    links.me = byId.get('customer.me')?.href;
    links.settings = byId.get('customer.me.settings')?.href;
    links.scan = hrefIfEnabled('customer.scan');
  } else if (role === 'dealer') {
    links.settings = byId.get('dealer.settings')?.href;
    links.scan = hrefIfEnabled('dealer.scan');
    links.assistant = hrefIfEnabled('dealer.assistant');
  } else if (role === 'admin') {
    links.settings = byId.get('admin.settings')?.href;
  }

  const gate: RouteGate = { blocked: [], open: [] };
  if (role === 'customer' || role === 'dealer') {
    for (const r of routes) {
      if (r.status === 'deprecated') continue; // emekli koçanı zaten yönlendirir
      if (enabled.has(r.id) || NEVER_BLOCKED.has(r.id)) gate.open.push(r.href);
      else gate.blocked.push(r.href);
    }
    if (!gate.blocked.length) gate.open = [];
  }

  return { role, homeHref: ROLE_HOME[role], nodes, bottomTabs, palette, shortcuts, links, gate };
}
