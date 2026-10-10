/**
 * Gelen Kutusu kabuğu sekmeleri — sunucuda çözülmüş kabuk yapılandırmasından (`getShellConfig`)
 * türetilir: Tümü · Telafi onayı · Vakalar · Bana atananlar. Modülü kapalı (`remedy_offers`,
 * `incidents`) ya da menüden gizlenmiş alt sekmeler kabukta da görünmez; liste tek kaynaktan
 * (`lib/navigation/registry.ts`, `dealer.inbox` çocukları) gelir. Saf; jest ile test edilir.
 */
import type { Bilingual, NavIconName } from '@/lib/navigation/registry';
import type { ShellConfig, ShellItem } from '@/lib/navigation/shell-config';

export const INBOX_ROOT_ID = 'dealer.inbox';
export const INBOX_ROOT_HREF = '/dealer/inbox';

export interface InboxTab {
  id: string;
  href: string;
  label: Bilingual;
  icon: NavIconName;
}

/** "Tümü" her zaman ilk sekmedir: gelen kutusunun çekirdeği (yorum listesi) gizlenmez. */
export const INBOX_ALL_TAB: InboxTab = {
  id: INBOX_ROOT_ID,
  href: INBOX_ROOT_HREF,
  label: { tr: 'Tümü', en: 'All' },
  icon: 'Inbox',
};

function findItem(items: ShellItem[], id: string): ShellItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = findItem(item.children, id);
    if (nested) return nested;
  }
  return null;
}

export function findInboxRoot(shell: Pick<ShellConfig, 'nodes'> | null | undefined): ShellItem | null {
  if (!shell) return null;
  for (const node of shell.nodes) {
    const items = node.kind === 'item' ? [node.item] : node.items;
    const hit = findItem(items, INBOX_ROOT_ID);
    if (hit) return hit;
  }
  return null;
}

export function resolveInboxTabs(shell: Pick<ShellConfig, 'nodes'> | null | undefined): InboxTab[] {
  const root = findInboxRoot(shell);
  const children: InboxTab[] = (root?.children ?? [])
    .filter((c) => c.href.startsWith(`${INBOX_ROOT_HREF}/`))
    .map((c) => ({ id: c.id, href: c.href, label: c.label, icon: c.icon }));
  return [INBOX_ALL_TAB, ...children];
}

/**
 * Etkin sekme: alt sekmeler için en uzun önek eşleşmesi; kök (`/dealer/inbox`) yalnız tam
 * eşleşmede etkindir (aksi hâlde her alt rota "Tümü"yü de etkin gösterirdi).
 */
export function activeInboxTab(tabs: readonly InboxTab[], pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  let best: InboxTab | null = null;
  for (const tab of tabs) {
    const hit = tab.href === INBOX_ROOT_HREF ? path === tab.href : path === tab.href || path.startsWith(`${tab.href}/`);
    if (hit && (!best || tab.href.length > best.href.length)) best = tab;
  }
  return best?.id ?? null;
}
