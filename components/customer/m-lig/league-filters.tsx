'use client';

import { useMemo } from 'react';
import { Award, MessageSquare, Sparkles, Star } from 'lucide-react';
import { ChoiceChips, type ChoiceOption } from '@/components/ds/a11y';
import { seasonWindow, type LeagueCategory, type LeaguePeriod } from '@/lib/league-board/periods';
import { useLigCopy } from './use-lig-copy';

const CATEGORY_ICONS: Record<LeagueCategory, typeof Star> = {
  points: Star,
  feedbacks: MessageSquare,
  badges: Award,
  referrals: Sparkles,
};

/**
 * Yapışkan filtre çubuğu: dönem (Hafta · Sezon N · Tüm zamanlar) + tür (Puan · Yorum · Rozet · Davet).
 * İkisi de radiogroup (oklarla gezilir, tek sekme durağı); seçim URL'de tutulur (üst bileşen).
 * Seçili türün nasıl sayıldığı tek satırda açıkça yazar (eski uzun kart açıklamaları yerine).
 */
export function LeagueFilters({
  period,
  category,
  onPeriod,
  onCategory,
}: {
  period: LeaguePeriod;
  category: LeagueCategory;
  onPeriod: (p: LeaguePeriod) => void;
  onCategory: (c: LeagueCategory) => void;
}) {
  const { copy } = useLigCopy();
  const seasonNumber = useMemo(() => seasonWindow(new Date()).seasonNumber ?? 1, []);

  const periodOptions: ChoiceOption<LeaguePeriod>[] = [
    { value: 'week', label: copy.period.week },
    { value: 'season', label: copy.seasonN(seasonNumber) },
    { value: 'all', label: copy.period.all },
  ];
  const categoryOptions: ChoiceOption<LeagueCategory>[] = (Object.keys(CATEGORY_ICONS) as LeagueCategory[]).map((key) => {
    const Icon = CATEGORY_ICONS[key];
    return { value: key, label: copy.category[key].label, icon: <Icon aria-hidden className="size-4" /> };
  });

  return (
    <div className="sticky top-0 z-20 -mx-1 space-y-2 rounded-2xl border border-subtle bg-surface-1 p-2 shadow-sm">
      <ChoiceChips
        aria-label={copy.periodLabel}
        options={periodOptions}
        value={period}
        onChange={(v) => v && onPeriod(v)}
        size="sm"
        scroll
      />
      <ChoiceChips
        aria-label={copy.categoryLabel}
        options={categoryOptions}
        value={category}
        onChange={(v) => v && onCategory(v)}
        size="sm"
        scroll
      />
      <p id="lig-metric" className="qx-caption px-1 text-fg-muted">
        {copy.category[category].metric}
      </p>
    </div>
  );
}
