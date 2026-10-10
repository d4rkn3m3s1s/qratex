/**
 * Analitik kabuğu sekmeleri — sunucuda çözülmüş kabuk yapılandırmasından (`getShellConfig`)
 * türetilir: Genel · Yoğunluk · İçgörüler · Kıyas · Etki. Modülü kapalı (ör. `heatmap`) ya da
 * menüden gizlenmiş sekme kabukta da görünmez; liste tek kaynaktan (`lib/navigation/registry.ts`,
 * `analytics` grubu) gelir. Saf; jest ile test edilir.
 */
import type { Bilingual, NavIconName } from '@/lib/navigation/registry';
import type { ShellConfig, ShellItem } from '@/lib/navigation/shell-config';

export const ANALYTICS_ROOT_ID = 'dealer.analytics';
export const ANALYTICS_ROOT_HREF = '/dealer/analytics';

export interface AnalyticsTab {
  id: string;
  href: string;
  label: Bilingual;
  icon: NavIconName;
}

/** Kök sekme her zaman ilk ve görünür (analitik omurgası gizlenmez). */
export const ANALYTICS_OVERVIEW_TAB: AnalyticsTab = {
  id: ANALYTICS_ROOT_ID,
  href: ANALYTICS_ROOT_HREF,
  label: { tr: 'Genel', en: 'Overview' },
  icon: 'BarChart3',
};

function flatten(items: ShellItem[]): ShellItem[] {
  return items.flatMap((i) => [i, ...flatten(i.children)]);
}

export function resolveAnalyticsTabs(shell: Pick<ShellConfig, 'nodes'> | null | undefined): AnalyticsTab[] {
  const tabs: AnalyticsTab[] = [ANALYTICS_OVERVIEW_TAB];
  if (!shell) return tabs;
  const seen = new Set<string>([ANALYTICS_ROOT_ID]);
  for (const node of shell.nodes) {
    const items = flatten(node.kind === 'item' ? [node.item] : node.items);
    for (const item of items) {
      if (seen.has(item.id) || !item.href.startsWith(`${ANALYTICS_ROOT_HREF}/`) || item.href.includes('[')) continue;
      seen.add(item.id);
      tabs.push({ id: item.id, href: item.href, label: item.label, icon: item.icon });
    }
  }
  return tabs;
}

/** Etkin sekme: en uzun önek; kök yalnız tam eşleşmede. */
export function activeAnalyticsTab(tabs: readonly AnalyticsTab[], pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  let best: AnalyticsTab | null = null;
  for (const tab of tabs) {
    const hit = tab.href === ANALYTICS_ROOT_HREF ? path === tab.href : path === tab.href || path.startsWith(`${tab.href}/`);
    if (hit && (!best || tab.href.length > best.href.length)) best = tab;
  }
  return best?.id ?? null;
}

/** Sekmeler arası taşınan bağlam (dönem + şube); sekmeye özgü süzgeçler taşınmaz. */
export const ANALYTICS_CONTEXT_KEYS = ['period', 'from', 'to', 'compare', 'location'] as const;

export function withAnalyticsContext(href: string, params: { get(key: string): string | null } | null | undefined): string {
  if (!params) return href;
  const sp = new URLSearchParams();
  for (const k of ANALYTICS_CONTEXT_KEYS) {
    const v = params.get(k);
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${href}?${qs}` : href;
}
