'use client';

/**
 * Puan Rehberi (oyunlaştırma-ekonomi O7) — Cüzdan → Hareketler → Puan sekmesinde açılır-kapanır
 * bölüm. Veri sunucuda ödemeyi yapan kodun kaynaklarından üretilir (lib/economy/earn-guide):
 * miktarlar puan matrisinden, sınırlar `ECONOMY_CAPS`'ten, "bugün" ilerlemesi tavanı uygulayan
 * sayımın aynısından. Burada yalnız gösterim; uydurma/sabit sayı yok.
 *
 * Erişilebilirlik: yerel `<details>/<summary>` (klavye + ekran okuyucu genişlet/daralt durumu),
 * tavan çubukları `role="meter"` + metin karşılığı (renk tek başına bilgi taşımaz).
 */
import type { ReactNode } from 'react';
import { BookOpen, ChevronDown, Flame, Gamepad2, Gift, MessageSquare, Store, Target, Users } from 'lucide-react';
import { useDsLocale } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import type { CapProgress, EarnGuide } from '@/lib/economy/earn-guide';

type Locale = 'tr' | 'en';

const nf = (locale: Locale) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR');

const COPY = {
  tr: {
    title: 'Puan nasıl kazanılır?',
    hint: 'Kaynaklar, miktarlar ve günlük sınırlar',
    todayLabel: 'Bugünkü sınırların',
    capLine: (earned: string, cap: string) => `${earned} / ${cap} puan`,
    capFull: 'Bugünkü sınır doldu — yarın (TSİ 03:00) yenilenir.',
    weekLine: (earned: string, cap: string) => `Bu hafta ${earned} / ${cap}`,
    feedback: 'QR geri bildirimi',
    feedbackDesc: (b: string, d: string, n: number) => `${b} puan; ${n}+ karakterlik ayrıntılı yorumda ${d} puan.`,
    review: 'Ziyaret yorumu',
    reviewDesc: (b: string, d: string, n: number) =>
      `${b} puan; ${n}+ karakterde ${d} puan. Geri bildirimle aynı günlük sınırı paylaşır.`,
    game: 'Mini oyunlar',
    gameDesc: (d: string, w: string) => `Oyun ödülleri günde en fazla ${d}, haftada ${w} puan.`,
    visit: 'İşletmede harcama',
    visitDesc: (per: string, place: string, day: string) =>
      `Kartını okuttuğun harcamadan pasif puan (tek işlemde en fazla ${per}); işletme başına günde ${place}, toplam günde ${day} puan.`,
    streak: 'Giriş serisi',
    streakDesc: (list: string) => `Art arda günlerde uğra: ${list}. Her taş ömür boyu bir kez ödenir.`,
    quests: 'Görevler ve rozetler',
    questsDesc: (q: string, min: string, max: string) =>
      `Görev ödülü genelde ${q} puan; rozet kazanınca bir kez ${min}–${max} puan.`,
    social: 'Davet ve doğum günü',
    socialDesc: (a: string, b: string, c: string) =>
      `Davet ettiğin kişi e-postasını doğrulayıp ilk QR geri bildirimini ya da kart harcamasını yapınca sen ${b}, o ${a} puan; doğum gününde ${c} puan.`,
    spin: 'Günlük çark',
    spinDesc: (n: number, max: string) => `Günde ${n} çevirme; en büyük puan ödülü ${max}.`,
    spinOff: 'Günlük çark şu an kapalı.',
    day: (d: number, p: string) => `${d}. gün +${p}`,
  },
  en: {
    title: 'How do I earn points?',
    hint: 'Sources, amounts and daily limits',
    todayLabel: 'Your limits today',
    capLine: (earned: string, cap: string) => `${earned} / ${cap} points`,
    capFull: 'Today’s limit is reached — it resets tomorrow (03:00 TRT).',
    weekLine: (earned: string, cap: string) => `This week ${earned} / ${cap}`,
    feedback: 'QR feedback',
    feedbackDesc: (b: string, d: string, n: number) => `${b} points; ${d} points for a detailed review of ${n}+ characters.`,
    review: 'Visit review',
    reviewDesc: (b: string, d: string, n: number) =>
      `${b} points; ${d} points at ${n}+ characters. Shares the daily limit with feedback.`,
    game: 'Mini games',
    gameDesc: (d: string, w: string) => `Game rewards are capped at ${d} points a day and ${w} a week.`,
    visit: 'Spending at a venue',
    visitDesc: (per: string, place: string, day: string) =>
      `Passive points when your card is scanned (max ${per} per purchase); ${place} per venue and ${day} in total per day.`,
    streak: 'Login streak',
    streakDesc: (list: string) => `Visit on consecutive days: ${list}. Each milestone pays once per lifetime.`,
    quests: 'Quests and badges',
    questsDesc: (q: string, min: string, max: string) =>
      `Quests usually pay ${q} points; earning a badge pays ${min}–${max} points once.`,
    social: 'Invites and birthday',
    socialDesc: (a: string, b: string, c: string) =>
      `When your invitee verifies their email and leaves a first QR review or card purchase you get ${b}, they get ${a} points; ${c} points on your birthday.`,
    spin: 'Daily wheel',
    spinDesc: (n: number, max: string) => `${n} spin(s) a day; top points prize ${max}.`,
    spinOff: 'The daily wheel is currently off.',
    day: (d: number, p: string) => `day ${d} +${p}`,
  },
} as const;

function CapMeter({ label, cap, locale }: { label: string; cap: CapProgress; locale: Locale }) {
  const c = COPY[locale];
  const f = nf(locale);
  const today = Math.min(cap.today, cap.daily);
  const pct = cap.daily > 0 ? Math.round((today / cap.daily) * 100) : 0;
  const full = cap.daily > 0 && cap.today >= cap.daily;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="qx-num text-sm text-fg-muted">{c.capLine(f.format(today), f.format(cap.daily))}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={cap.daily}
        aria-valuenow={today}
        aria-valuetext={c.capLine(f.format(today), f.format(cap.daily))}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn('h-full rounded-full', full ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
      {full ? <p className="qx-caption text-fg-muted">{c.capFull}</p> : null}
      {cap.weekly && cap.week !== null ? (
        <p className="qx-caption text-fg-subtle">{c.weekLine(f.format(Math.min(cap.week, cap.weekly)), f.format(cap.weekly))}</p>
      ) : null}
    </div>
  );
}

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="qx-caption text-fg-muted">{children}</p>
      </div>
    </li>
  );
}

export function EarnGuidePanel({ guide }: { guide: EarnGuide }) {
  const locale: Locale = useDsLocale() === 'en' ? 'en' : 'tr';
  const c = COPY[locale];
  const f = nf(locale);
  const n = (v: number) => f.format(v);
  const streakList = guide.streak.milestones.map((m) => c.day(m.days, n(m.points))).join(' · ');

  return (
    <details className="group rounded-card border border-subtle bg-surface-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <BookOpen className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">{c.title}</span>
          <span className="qx-caption block text-fg-muted">{c.hint}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="space-y-5 border-t border-subtle px-4 py-4">
        <section aria-label={c.todayLabel} className="space-y-3">
          <h3 className="qx-caption font-semibold uppercase tracking-wide text-fg-subtle">{c.todayLabel}</h3>
          <CapMeter label={c.feedback} cap={guide.feedback.cap} locale={locale} />
          <CapMeter label={c.game} cap={guide.game.cap} locale={locale} />
          <CapMeter
            label={c.visit}
            cap={{ today: guide.visit.today, daily: guide.visit.daily, week: null, weekly: null }}
            locale={locale}
          />
        </section>
        <ul className="space-y-3">
          <Row icon={<MessageSquare />} title={c.feedback}>
            {c.feedbackDesc(n(guide.feedback.base), n(guide.feedback.detailed), guide.feedback.longTextThreshold)}
          </Row>
          <Row icon={<MessageSquare />} title={c.review}>
            {c.reviewDesc(n(guide.review.base), n(guide.review.detailed), guide.review.longTextThreshold)}
          </Row>
          <Row icon={<Store />} title={c.visit}>
            {c.visitDesc(n(guide.visit.perConsumptionMax), n(guide.visit.perPlaceDaily), n(guide.visit.daily))}
          </Row>
          <Row icon={<Gamepad2 />} title={c.game}>
            {c.gameDesc(n(guide.game.cap.daily), n(guide.game.cap.weekly ?? 0))}
          </Row>
          {guide.streak.milestones.length > 0 ? (
            <Row icon={<Flame />} title={c.streak}>
              {c.streakDesc(streakList)}
            </Row>
          ) : null}
          <Row icon={<Target />} title={c.quests}>
            {c.questsDesc(n(guide.questDefault), n(guide.badges.min), n(guide.badges.max))}
          </Row>
          <Row icon={<Users />} title={c.social}>
            {c.socialDesc(n(guide.referral.referred), n(guide.referral.referrer), n(guide.birthday))}
          </Row>
          <Row icon={<Gift />} title={c.spin}>
            {guide.spin.enabled ? c.spinDesc(guide.spin.dailyLimit, n(guide.spin.maxPrize)) : c.spinOff}
          </Row>
        </ul>
      </div>
    </details>
  );
}
