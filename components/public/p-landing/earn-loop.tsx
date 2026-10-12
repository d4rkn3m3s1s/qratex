import { Gift, MessageSquareHeart, QrCode, Trophy, type LucideIcon } from 'lucide-react';
import { Reveal } from '@/lib/motion/reveal';
import type { EarnPreview } from '@/lib/landing/earn-preview-core';
import { fmt, formatInt, type PublicLocale } from './fmt';
import type { LandingCopy } from './landing-copy';
import { PublicSection, SectionHeading } from './section';

const ICONS: LucideIcon[] = [QrCode, MessageSquareHeart, Trophy, Gift];

/**
 * "Okut → Paylaş → Rozet & Lig → Ödül" kazanç döngüsü. Tüm rakamlar sunucudaki puan
 * matrisi, lig kuralları ve karakter kataloğundan (uydurma metin yok).
 */
export function EarnLoop({ copy, earn, locale }: { copy: LandingCopy['earn']; earn: EarnPreview; locale: PublicLocale }) {
  const vars = {
    base: formatInt(earn.feedback.base.points, locale),
    baseXp: formatInt(earn.feedback.base.xp, locale),
    detailed: formatInt(earn.feedback.detailed.points, locale),
    detailedXp: formatInt(earn.feedback.detailed.xp, locale),
    threshold: formatInt(earn.feedback.longTextThreshold, locale),
    characters: formatInt(earn.characterCount, locale),
    leagueCount: formatInt(earn.leagues.length, locale),
    dailyCap: formatInt(earn.feedbackDailyCap, locale),
  };
  return (
    <PublicSection id="nasil-calisir" labelledBy="earn-title">
      <SectionHeading id="earn-title" eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
      {/* Kart tekrarı yerine tek bir akış çizgisi: adımlar sırayla okunur, numara hiyerarşiyi taşır. */}
      <ol className="relative grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[1.375rem] hidden h-px bg-gradient-to-r from-primary/60 via-border to-transparent lg:block" />
        {copy.steps.map((step, i) => {
          const Icon = ICONS[i] ?? Gift;
          return (
            <Reveal as="li" index={i} key={step.title} className="relative list-none border-l border-subtle pl-5 lg:border-l-0 lg:pl-0">
              <div className="flex items-center gap-3">
                <span
                  className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-subtle bg-surface-1 text-primary"
                  aria-hidden
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <span className="mt-5 block font-mono text-xs tabular-nums text-fg-subtle" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-fg">{step.title}</h3>
              <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-fg-muted">{fmt(step.body, vars)}</p>
            </Reveal>
          );
        })}
      </ol>
      <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-fg-subtle">{fmt(copy.note, vars)}</p>
    </PublicSection>
  );
}
