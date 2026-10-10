'use client';

import { useAppLocale } from '@/lib/app-locale';
import { getCampaignCopy, toCampaignLocale, type CampaignCopy, type CampaignLocale } from '../copy';

export function useCampaignCopy(): { c: CampaignCopy; locale: CampaignLocale } {
  const { locale } = useAppLocale();
  const l = toCampaignLocale(locale);
  return { c: getCampaignCopy(l), locale: l };
}
