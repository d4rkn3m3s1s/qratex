'use client';

/** Kabuk yapılandırmasındaki alt sekmeleri (`bottomTabs`) `MobileTabBar`'a bağlar. */
import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { MobileTabBar } from '@/components/ds/mobile-tab-bar';
import { navIcon } from '@/lib/navigation/icons';
import { matchActiveHref } from '@/lib/navigation/registry';
import type { ShellItem, ShellNode } from '@/lib/navigation/shell-config';
import { useBilingual, useShell } from './shell-context';

function findItem(nodes: ShellNode[], id: string): ShellItem | undefined {
  for (const n of nodes) {
    const list = n.kind === 'item' ? [n.item] : n.items;
    const hit = list.find((it) => it.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function ShellTabBar() {
  const ctx = useShell();
  const pathname = usePathname() ?? '';
  const bl = useBilingual();
  const tabs = ctx?.shell.bottomTabs;
  const nodes = ctx?.shell.nodes;
  const homeHref = ctx?.shell.homeHref;

  const activeId = useMemo(() => {
    if (!tabs?.length) return null;
    // Sekmenin alt öğeleri (ör. Oyna → /customer/quests) de o sekmeyi yakar.
    const owner = new Map<string, string>();
    for (const tab of tabs) {
      owner.set(tab.href, tab.id);
      const walk = (it: ShellItem) => {
        owner.set(it.href, tab.id);
        it.children.forEach(walk);
      };
      const item = nodes ? findItem(nodes, tab.id) : undefined;
      item?.children.forEach(walk);
    }
    const href = matchActiveHref(pathname, [...owner.keys()], homeHref);
    return href ? owner.get(href) ?? null : null;
  }, [tabs, nodes, pathname, homeHref]);

  // Portal'la köke çizilen katmanlar (toast) da çubuğun üstünde kalsın: değişkeni <html>'e yayınla.
  const hasTabs = !!tabs?.length;
  useEffect(() => {
    if (!hasTabs || typeof window === 'undefined') return;
    const root = document.documentElement;
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => {
      if (mq.matches) root.style.removeProperty('--qx-tabbar-h');
      else root.style.setProperty('--qx-tabbar-h', 'calc(4rem + env(safe-area-inset-bottom, 0px))');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      root.style.removeProperty('--qx-tabbar-h');
    };
  }, [hasTabs]);

  if (!tabs?.length) return null;
  const items = tabs.map((t) => ({ id: t.id, href: t.href, label: bl(t.label), icon: navIcon(t.icon), fab: t.fab }));
  return <MobileTabBar items={items} activeId={activeId} ariaLabel={bl({ tr: 'Ana gezinme', en: 'Main navigation' })} />;
}
