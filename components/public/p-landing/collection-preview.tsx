import { CalendarCheck, Dices, HelpCircle, Users } from 'lucide-react';
import type { EarnPreview } from '@/lib/landing/earn-preview-core';
import { Reveal } from '@/lib/motion/reveal';
import { fmt, formatInt, type PublicLocale } from './fmt';
import type { LandingCopy } from './landing-copy';
import { PublicSection, SectionHeading } from './section';

/**
 * Rozet koleksiyonu + lig basamakları + ek kazanç yolları. Veri gerçek katalogdan:
 * karakter kategorileri (ad, karakter sayısı), lig kuralları (ad, giriş puanı), davet ve
 * seri ödülleri (puan matrisi). Karakter isimleri gösterilmez — sürpriz korunur.
 */
export function CollectionPreview({
  copy,
  earn,
  locale,
}: {
  copy: LandingCopy['collection'];
  earn: EarnPreview;
  locale: PublicLocale;
}) {
  const streakList = earn.streakMilestones
    .map((m) => fmt(copy.streakItem, { days: formatInt(m.days, locale), points: formatInt(m.points, locale) }))
    .join(', ');

  return (
    <PublicSection id="koleksiyon" labelledBy="collection-title">
      <SectionHeading
        id="collection-title"
        eyebrow={copy.eyebrow}
        title={copy.title}
        align="start"
        sub={fmt(copy.sub, {
          characters: formatInt(earn.characterCount, locale),
          categoryCount: formatInt(earn.characterCategories.length, locale),
        })}
      />

      <ul className="grid grid-cols-1 border-t border-subtle sm:grid-cols-2 lg:grid-cols-3">
        {earn.characterCategories.map((c, i) => (
          <Reveal as="li" index={i} key={c.key} className="list-none border-b border-subtle">
            <div className="flex h-full items-center gap-4 py-4 sm:pr-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-2xl" aria-hidden>
                {c.mystery ? <HelpCircle className="h-5 w-5 text-brand" /> : c.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">{c.name}</p>
                {c.mystery ? <p className="mt-0.5 text-xs text-fg-muted">{copy.mysteryNote}</p> : null}
              </div>
              <p className="qx-num shrink-0 text-sm text-fg-muted">{fmt(copy.categoryCount, { n: formatInt(c.count, locale) })}</p>
            </div>
          </Reveal>
        ))}
      </ul>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-card border border-subtle bg-surface-1/85 p-5 backdrop-blur-md sm:p-6">
          <h3 className="text-lg font-semibold text-fg">{copy.leaguesTitle}</h3>
          <p className="mt-1 text-sm text-fg-muted">{copy.leaguesSub}</p>
          <ol className="mt-5 flex flex-wrap gap-2" aria-label={copy.leaguesTitle}>
            {earn.leagues.map((l, i) => (
              <li
                key={l.key}
                className="flex min-h-11 items-center gap-2 rounded-full border border-subtle bg-surface-0 py-1.5 pl-1.5 pr-3.5"
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-full bg-brand-subtle text-xs font-bold text-brand qx-num"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="text-sm">
                  <span className="font-semibold text-fg">{l.name}</span>
                  <span className="block text-xs text-fg-muted qx-num">
                    {fmt(copy.leagueFrom, { points: formatInt(l.minPoints, locale) })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-card border border-subtle bg-surface-1/85 p-5 backdrop-blur-md sm:p-6">
          <h3 className="text-lg font-semibold text-fg">{copy.extrasTitle}</h3>
          <ul className="mt-4 space-y-3 text-sm text-fg-muted">
            {earn.referral.referrerPoints > 0 ? (
              <li className="flex items-start gap-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <span>
                  {fmt(copy.referral, {
                    referrer: formatInt(earn.referral.referrerPoints, locale),
                    referred: formatInt(earn.referral.referredPoints, locale),
                  })}
                </span>
              </li>
            ) : null}
            {streakList ? (
              <li className="flex items-start gap-3">
                <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <span>{fmt(copy.streak, { list: streakList })}</span>
              </li>
            ) : null}
            {earn.spinEnabled ? (
              <li className="flex items-start gap-3">
                <Dices className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <span>{copy.spin}</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </PublicSection>
  );
}
