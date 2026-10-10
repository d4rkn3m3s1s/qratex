/**
 * Cüzdan kabuğu sekmeleri — sunucuda çözülmüş kabuk yapılandırmasından (`getShellConfig`)
 * türetilir. Böylece modülü kapalı (`rewards`, `donations`) ya da menüden gizlenmiş
 * sekmeler kabukta da görünmez; sekme listesi tek kaynaktan (`lib/navigation/registry.ts`)
 * gelir. Saf; jest ile test edilir.
 */
import type { Bilingual, NavIconName } from '@/lib/navigation/registry';
import type { ShellConfig, ShellItem } from '@/lib/navigation/shell-config';

export const WALLET_ROOT_ID = 'customer.wallet';
export const WALLET_CARD_HREF = '/customer/wallet/card';

export interface WalletTab {
  id: string;
  href: string;
  label: Bilingual;
  icon: NavIconName;
}

/** Kartım her zaman ilk sekmedir: cüzdanın çekirdeği (kasada QR) hiçbir ayarla gizlenmez. */
const CARD_TAB: WalletTab = {
  id: 'customer.wallet.card',
  href: WALLET_CARD_HREF,
  label: { tr: 'Kartım', en: 'My card' },
  icon: 'CreditCard',
};

function findItem(items: ShellItem[], id: string): ShellItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = findItem(item.children, id);
    if (nested) return nested;
  }
  return null;
}

export function findWalletRoot(shell: Pick<ShellConfig, 'nodes'> | null | undefined): ShellItem | null {
  if (!shell) return null;
  for (const node of shell.nodes) {
    const items = node.kind === 'item' ? [node.item] : node.items;
    const hit = findItem(items, WALLET_ROOT_ID);
    if (hit) return hit;
  }
  return null;
}

export function resolveWalletTabs(shell: Pick<ShellConfig, 'nodes'> | null | undefined): WalletTab[] {
  const root = findWalletRoot(shell);
  const children: WalletTab[] = (root?.children ?? [])
    .filter((c) => c.href.startsWith('/customer/wallet/'))
    .map((c) => ({ id: c.id, href: c.href, label: c.label, icon: c.icon }));
  const withoutCard = children.filter((c) => c.href !== WALLET_CARD_HREF);
  const card = children.find((c) => c.href === WALLET_CARD_HREF) ?? CARD_TAB;
  return [card, ...withoutCard];
}

/** Etkin sekme: yolun en uzun önek eşleşmesi (`/customer/wallet/owned/xyz` → Ödüllerim). */
export function activeWalletTab(tabs: readonly WalletTab[], pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  let best: WalletTab | null = null;
  for (const tab of tabs) {
    if (path === tab.href || path.startsWith(`${tab.href}/`)) {
      if (!best || tab.href.length > best.href.length) best = tab;
    }
  }
  return best?.id ?? null;
}
