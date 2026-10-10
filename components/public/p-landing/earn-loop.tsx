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
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {copy.steps.map((step, i) => {
          const Icon = ICONS[i] ?? Gift;
          return (
            <Reveal as="li" index={i} key={step.title} className="list-none">
              <div className="relative h-full rounded-card border border-subtle bg-surface-1/85 p-5 backdrop-blur-md sm:p-6">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-glow"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="qx-overline text-fg-subtle" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{fmt(step.body, vars)}</p>
              </div>
            </Reveal>
          );
        })}
      </ol>
      <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-fg-subtle">{fmt(copy.note, vars)}</p>
    </PublicSection>
  );
}
