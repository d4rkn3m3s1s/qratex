'use client';

import { Trophy } from 'lucide-react';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { useLigCopy } from './use-lig-copy';

/** Sunucuda verilen kapı kararı (modül kapalı / yetkisiz) — "veri yok" gibi gösterilmez (K5). */
export function LeagueUnavailable({ kind }: { kind: 'moduleDisabled' | 'forbidden' }) {
  const { copy } = useLigCopy();
  return (
    <PanelPage register="play" header={<PageHeader title={copy.title} icon={<Trophy aria-hidden className="size-6" />} />}>
      <ErrorState
        kind={kind}
        variant="section"
        {...(kind === 'moduleDisabled'
          ? { title: copy.moduleDisabledTitle, description: copy.moduleDisabledDescription }
          : {})}
      />
    </PanelPage>
  );
}
