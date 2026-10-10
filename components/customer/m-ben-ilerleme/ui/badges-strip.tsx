import Link from 'next/link';
import { Award, ChevronRight } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { BadgeGlyph, RarityBadge } from '@/components/ds/play';
import { routeHref } from '@/lib/navigation/registry';
import { formatDate, formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressSummary } from '../types';
import { SectionUnavailable } from './section-unavailable';
import { TEXT_LINK } from './styles';

/**
 * Son kazanılan rozetler — gerçek görsel (küçük WebP), nadirlik ikon+metinle, `earnedAt`
 * sırası. Eski hub dosya yolunu metin basıyordu; trends'in listesi bozuk sorgu yüzünden hep
 * boştu (progress-hub bulgu 3, trends bulgu 1).
 */
export function BadgesStrip({ summary, locale }: { summary: ProgressSummary; locale: MeLocale }) {
  const c = getMeCopy(locale).progress;
  const failed = summary.partial.includes('badges');
  const { total, recent } = summary.badges;
  const href = routeHref('customer.me.badges');

  return (
    <SectionCard
      title={c.badgesTitle}
      description={failed ? undefined : c.badgesTotal(formatNumber(total, locale))}
      icon={<Award />}
      actions={
        <Link href={href} className={TEXT_LINK}>
          {c.badgesAll}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
    >
      {failed ? (
        <SectionUnavailable locale={locale} />
      ) : recent.length === 0 ? (
        <p className="qx-small text-fg-muted">{c.badgesEmpty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {recent.map((b) => (
            <li key={b.id} className="flex min-w-0 flex-col items-center gap-1.5 rounded-control border border-subtle p-3 text-center">
              <BadgeGlyph
                label={b.name}
                imageSrc={b.imageSrc}
                emoji={b.emoji ?? undefined}
                rarity={b.rarity}
                color={b.color ?? undefined}
                size="lg"
                locale={locale}
              />
              <span className="qx-small line-clamp-2 font-medium text-fg">{b.name}</span>
              <RarityBadge rarity={b.rarity} locale={locale} />
              <time dateTime={b.earnedAt} className="qx-caption text-fg-muted">
                {c.earnedOn(formatDate(b.earnedAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
