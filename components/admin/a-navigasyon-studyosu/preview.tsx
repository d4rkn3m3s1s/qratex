'use client';

import { useMemo, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { buildShellConfig, type ShellItem, type ShellNode } from '@/lib/navigation/shell-config';
import { navIcon } from '@/lib/navigation/icons';
import { supportsVisibility, type RoleConfig, type StudioRole } from '@/lib/admin-navigation/contract';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useNavStudioCopy } from './copy';

type Lang = 'tr' | 'en';

/**
 * Canlı önizleme: kabuğun KENDİ çözücüsü (`buildShellConfig`) taslakla çalıştırılır — yayınlanınca
 * kullanıcının göreceği menünün birebir aynısı (gizli öğeler ve kapalı modüller düşer).
 */
export function NavPreview({
  role,
  config,
  modulesOff,
  highlightId,
}: {
  role: StudioRole;
  config: RoleConfig;
  modulesOff: string[];
  highlightId: string | null;
}) {
  const nx = useNavStudioCopy();
  const [lang, setLang] = useState<Lang>('tr');
  const motion = useMotionPolicy();
  const shell = useMemo(
    () =>
      buildShellConfig(role, {
        order: config.order,
        groups: { groupLabels: config.groupLabels, itemGroups: config.itemGroups },
        menuVisibility: supportsVisibility(role) ? Object.fromEntries(config.hidden.map((k) => [k, false])) : null,
        moduleControls: Object.fromEntries(modulesOff.map((k) => [k, false])),
      }),
    [role, config, modulesOff]
  );
  const count = shell.nodes.reduce((n, node) => n + (node.kind === 'item' ? 1 : node.items.length), 0);

  return (
    <section aria-labelledby="nav-preview-title" className="rounded-card border border-border bg-surface-1">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 id="nav-preview-title" className="text-sm font-semibold text-fg">
            Canlı önizleme
          </h2>
          <p className="text-xs text-fg-muted">{count} üst düzey öğe · yayınlanınca böyle görünür</p>
        </div>
        <div role="radiogroup" aria-label="Önizleme dili" className="flex rounded-chip border border-border p-0.5">
          {(['tr', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              onClick={() => setLang(l)}
              className={cn(
                'hit-area min-h-9 min-w-11 rounded-chip px-2 text-xs font-semibold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                lang === l ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:text-fg'
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </header>
      <nav aria-label="Menü önizlemesi" tabIndex={0} className="max-h-[60vh] overflow-y-auto p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" lang={lang}>
        {shell.nodes.length === 0 ? (
          <p className="p-3 text-sm text-fg-muted">{nx.noVisibleItems}</p>
        ) : (
          <ul className="space-y-0.5">
            {shell.nodes.map((node) => (
              <PreviewNode key={node.kind === 'item' ? node.item.id : `g:${node.id}`} node={node} lang={lang} highlightId={highlightId} reduce={motion.reduce} />
            ))}
          </ul>
        )}
      </nav>
      {shell.bottomTabs.length > 0 && (
        <div className="border-t border-border p-2">
          <p className="px-1 pb-1 text-xs font-medium text-fg-muted">Mobil alt sekmeler (sabit)</p>
          <ul className="grid grid-cols-5 gap-1">
            {shell.bottomTabs.map((t) => {
              const Icon = navIcon(t.icon);
              return (
                <li key={t.id} className="flex flex-col items-center gap-0.5 rounded-md p-1 text-center text-[11px] text-fg-muted">
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="line-clamp-1">{t.label[lang]}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function PreviewNode({ node, lang, highlightId, reduce }: { node: ShellNode; lang: Lang; highlightId: string | null; reduce: boolean }) {
  if (node.kind === 'item') return <PreviewItem item={node.item} lang={lang} highlightId={highlightId} reduce={reduce} />;
  const Icon = navIcon(node.icon);
  return (
    <li>
      <div className="flex items-center gap-2 px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate">{node.label[lang]}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5" aria-hidden />
      </div>
      <ul className="space-y-0.5">
        {node.items.map((it) => (
          <PreviewItem key={it.id} item={it} lang={lang} highlightId={highlightId} reduce={reduce} />
        ))}
      </ul>
    </li>
  );
}

function PreviewItem({ item, lang, highlightId, reduce, depth = 0 }: { item: ShellItem; lang: Lang; highlightId: string | null; reduce: boolean; depth?: number }) {
  const Icon = navIcon(item.icon);
  const hit = item.id === highlightId;
  return (
    <Motion.li layout={reduce ? false : 'position'} transition={{ duration: DURATION.base, ease: EASE.standard }}>
      <div
        className={cn(
          'flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-fg transition-shadow',
          depth > 0 && 'ml-6 text-[13px] text-fg-muted',
          hit && 'bg-brand-subtle ring-2 ring-brand'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{item.label[lang]}</span>
      </div>
      {item.children.length > 0 && (
        <ul className="space-y-0.5">
          {item.children.map((c) => (
            <PreviewItem key={c.id} item={c} lang={lang} highlightId={highlightId} reduce={reduce} depth={depth + 1} />
          ))}
        </ul>
      )}
    </Motion.li>
  );
}
