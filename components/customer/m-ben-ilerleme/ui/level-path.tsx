import { Flag } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { cn } from '@/lib/utils';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressSummary } from '../types';

/**
 * Seviye yolu: şimdiki seviye + sonraki üç eşik (kümülatif XP ve kalan). Seviye eğrisinin
 * geometrik olduğunu görünür kılar — eski ekranlardaki "her seviye 1000 XP" yanılgısının yerine.
 */
export function LevelPath({ summary, locale }: { summary: ProgressSummary; locale: MeLocale }) {
  const c = getMeCopy(locale).progress;
  const n = (v: number) => formatNumber(v, locale);
  const { level, upcoming } = summary;

  return (
    <SectionCard id="seviye" title={c.pathTitle} description={c.pathDescription} icon={<Flag />}>
      <ol className="relative space-y-0">
        <li className="relative flex gap-3 pb-5" aria-current="step">
          <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-surface-3">
            <span className="block w-full rounded-full bg-brand" style={{ height: `${level.percent}%` }} />
          </span>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand qx-small font-display font-bold text-brand-fg">
            {n(level.level)}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="qx-small font-semibold text-fg">{c.levelLabel(n(level.level))}</p>
            <p className="qx-caption qx-num text-fg-muted">
              {c.xpOf(n(level.xpIntoLevel), n(level.xpForLevel))} · {formatNumber(level.percent / 100, locale, { style: 'percent' })}
            </p>
          </div>
        </li>
        {upcoming.map((m, i) => (
          <li key={m.level} className={cn('relative flex gap-3', i < upcoming.length - 1 && 'pb-5')}>
            {i < upcoming.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-surface-3" />}
            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-strong bg-surface-1 qx-small font-display font-semibold text-fg-muted">
              {n(m.level)}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="qx-small font-medium text-fg">{c.levelLabel(n(m.level))}</p>
              <p className="qx-caption qx-num text-fg-muted">
                {c.pathAt(n(m.atXp))} · {c.pathRemaining(n(m.remaining))}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
