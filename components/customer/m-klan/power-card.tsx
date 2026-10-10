'use client';

import { HelpCircle, Zap } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { XpRing } from '@/components/ds/play';
import type { SquadDto } from '@/lib/squads/dto';
import { useKlanCopy, useKlanLocale } from './copy';

/** Klan gücü + seviye — dürüst tanım: harcanmaz, dağıtılmaz; prestij ve seviye (Bulgu 2, Seçenek B). */
export function PowerCard({ squad }: { squad: SquadDto }) {
  const copy = useKlanCopy();
  const { tag } = useKlanLocale();
  return (
    <SectionCard title={copy.powerTitle} icon={<Zap className="h-4 w-4" aria-hidden />} density="compact">
      <div className="flex items-center gap-4">
        <XpRing level={squad.level} percent={Math.round(squad.levelProgress * 100)} size={64} />
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold tabular-nums text-fg">{squad.power.toLocaleString(tag)}</p>
          <p className="text-xs text-fg-muted">{copy.powerNext(Math.max(0, squad.nextLevelAt - squad.power))}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-fg-muted">{copy.powerDesc}</p>
    </SectionCard>
  );
}

export function HowItWorksCard() {
  const copy = useKlanCopy();
  return (
    <SectionCard title={copy.howTitle} icon={<HelpCircle className="h-4 w-4" aria-hidden />} density="compact">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
        {copy.howItems.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </SectionCard>
  );
}
