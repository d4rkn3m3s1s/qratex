'use client';

/**
 * Bağış ortak parçaları: proje ikonu, ilerleme çubuğu, proje kartı (tek bileşen — denetim B15'teki
 * iki kopya kart birleşti), kategori tonu. ops kaydı: düz yüzey, kenarlık, token renkleri.
 */
import type { ReactNode } from 'react';
import { CalendarClock, CheckCircle2, Heart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DonationProjectDto } from '@/lib/customer-wallet/donate/service';
import type { KnownCategory } from '@/lib/customer-wallet/donate/impact';
import { useMovesCopy } from './copy';
import type { Formatters } from './format';

const CATEGORY_TOKEN: Record<KnownCategory | 'other', string> = {
  water: '--category-1',
  education: '--category-2',
  environment: '--category-3',
  animals: '--category-4',
  health: '--category-5',
  other: '--category-8',
};

export function categoryTint(category: KnownCategory | 'other'): { backgroundColor: string } {
  return { backgroundColor: `hsl(var(${CATEGORY_TOKEN[category]}) / 0.16)` };
}

/** Emoji ya da görsel yolu; bilinmeyen biçimde kalp ikonu. */
export function ProjectIcon({ icon, category, size = 44 }: { icon: string; category: KnownCategory | 'other'; size?: number }) {
  const isPath = /^(https?:)?\/\//.test(icon) || icon.startsWith('/');
  const isEmoji = !isPath && icon.trim().length > 0 && icon.trim().length <= 8;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center overflow-hidden rounded-control text-xl"
      style={{ width: size, height: size, ...categoryTint(category) }}
    >
      {isPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin'in girdiği proje görseli; sabit boyut
        <img src={icon} alt="" width={size} height={size} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : isEmoji ? (
        icon.trim()
      ) : (
        <Heart className="h-5 w-5 text-fg-muted" />
      )}
    </span>
  );
}

/** İlerleme çubuğu — `role="progressbar"` + sayısal metin (yalnız renge dayanmaz). */
export function ProgressBar({
  percent,
  label,
  className,
  children,
}: {
  percent: number;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p)}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        {children ?? <div className="h-full rounded-full bg-brand transition-[width] duration-slow ease-standard" style={{ width: `${p}%` }} />}
      </div>
    </div>
  );
}

export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000) - 1;
}

export function ProjectCard({
  project,
  fmt,
  onDetails,
  onDonate,
  canDonate,
  highlight,
}: {
  project: DonationProjectDto;
  fmt: Formatters;
  onDetails: () => void;
  onDonate: () => void;
  canDonate: boolean;
  highlight?: ReactNode;
}) {
  const { copy } = useMovesCopy();
  const p = project.progress;
  const titleId = `project-${project.id}-title`;
  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-4">
      <header className="flex items-start gap-3">
        <ProjectIcon icon={project.icon} category={project.category} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="qx-caption text-fg-muted">{copy.categories[project.category]}</span>
            {project.featured ? (
              <span className="qx-caption inline-flex items-center gap-1 rounded-chip bg-brand-subtle px-1.5 py-0.5 text-brand">
                <Sparkles className="h-3 w-3" aria-hidden />
                {copy.featured}
              </span>
            ) : null}
            {highlight}
          </div>
          <h3 id={titleId} className="qx-small mt-0.5 font-semibold text-fg">
            {project.name}
          </h3>
        </div>
      </header>
      <p className="qx-small line-clamp-3 text-fg-muted">{project.description}</p>

      <div className="mt-auto space-y-2">
        {p.percent != null ? (
          <>
            <ProgressBar
              percent={p.percent}
              label={copy.progressAria(fmt.int(project.current), fmt.int(project.goal), fmt.dec(p.percent))}
            />
            <div className="qx-caption flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-fg-muted">
              <span className="qx-num">
                {copy.progressLabel(fmt.dec(p.percent))} · {fmt.int(project.current)} / {fmt.int(project.goal)}
              </span>
              {p.completed ? (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {copy.goalReached}
                </span>
              ) : (
                <span className="qx-num">{copy.remaining(fmt.int(p.remaining ?? 0))}</span>
              )}
            </div>
          </>
        ) : (
          <p className="qx-caption text-fg-muted">
            {copy.noGoal} · <span className="qx-num">{copy.collected(fmt.int(project.current))}</span>
          </p>
        )}
        <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-subtle">
          {project.endDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {copy.daysLeft(daysUntil(project.endDate))}
            </span>
          ) : null}
          {project.donationCount > 0 ? <span className="qx-num">{copy.donationCount(fmt.int(project.donationCount))}</span> : null}
          {project.myDonation > 0 ? (
            <span className="qx-num font-medium text-brand">{copy.yourContribution(fmt.int(project.myDonation))}</span>
          ) : null}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="min-h-11 flex-1" onClick={onDetails} aria-describedby={titleId}>
            {copy.details}
          </Button>
          <Button className="min-h-11 flex-1" onClick={onDonate} disabled={!canDonate || p.completed} aria-describedby={titleId}>
            <Heart className="mr-2 h-4 w-4" aria-hidden />
            {copy.donateCta}
          </Button>
        </div>
      </div>
    </article>
  );
}
