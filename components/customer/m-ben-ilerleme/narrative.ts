/**
 * Dönem anlatısı — "Bu dönemde ne yaptım?" sorusunun tek cümlelik cevabı. Saf ve
 * deterministik: sayıyı kod hesaplar, cümleyi şablon kurar (GET'te LLM yok — ilke 7).
 * analytics "eksik özellikler 1" (anlatı katmanı) karşılığı.
 */
import { formatNumber, type MeLocale } from './copy';
import type { Kpi, KpiKey } from './types';

function pick(kpis: readonly Kpi[], key: KpiKey): Kpi | undefined {
  return kpis.find((k) => k.key === key);
}

export function periodNarrative(kpis: readonly Kpi[], periodDays: number, locale: MeLocale): string | null {
  const reviews = pick(kpis, 'reviews');
  const visits = pick(kpis, 'visits');
  const places = pick(kpis, 'places');
  const points = pick(kpis, 'pointsEarned');
  if (!reviews || reviews.current == null || !visits || visits.current == null) return null;

  const n = (v: number) => formatNumber(v, locale);
  const period = locale === 'en' ? (periodDays === 365 ? 'the last year' : `the last ${n(periodDays)} days`) : periodDays === 365 ? 'Son bir yılda' : `Son ${n(periodDays)} günde`;
  const r = reviews.current;
  const v = visits.current;
  const p = places?.current ?? 0;
  const pts = points?.current ?? null;

  if (r === 0 && v === 0) {
    return locale === 'en'
      ? `No activity in ${period} yet. Scanning a QR code is a good start.`
      : `${period} henüz bir etkinliğin yok. Bir QR okutarak başlayabilirsin.`;
  }

  const parts: string[] = [];
  if (locale === 'en') {
    parts.push(`In ${period} you wrote ${n(r)} ${r === 1 ? 'review' : 'reviews'} and made ${n(v)} ${v === 1 ? 'visit' : 'visits'}`);
    if (p > 0) parts[0] += ` across ${n(p)} ${p === 1 ? 'place' : 'places'}`;
    parts[0] += '.';
    if (pts != null && pts > 0) parts.push(`You earned ${n(pts)} points.`);
    if (reviews.change.kind === 'pct' && reviews.change.value !== 0) {
      const pct = formatNumber(Math.abs(reviews.change.value) / 100, locale, { style: 'percent', maximumFractionDigits: 0 });
      parts.push(`Your reviews ${reviews.change.value > 0 ? 'rose' : 'fell'} ${pct} versus the previous period.`);
    } else if (reviews.change.kind === 'new') {
      parts.push('Your first reviews in a while — welcome back.');
    }
  } else {
    let first = `${period} ${n(r)} yorum yazdın, ${n(v)} ziyaret yaptın`;
    if (p > 0) first += ` ve ${n(p)} farklı mekânda bulundun`;
    parts.push(`${first}.`);
    if (pts != null && pts > 0) parts.push(`Bu sürede ${n(pts)} puan kazandın.`);
    if (reviews.change.kind === 'pct' && reviews.change.value !== 0) {
      const pct = formatNumber(Math.abs(reviews.change.value) / 100, locale, { style: 'percent', maximumFractionDigits: 0 });
      parts.push(`Yorumların önceki döneme göre ${pct} ${reviews.change.value > 0 ? 'arttı' : 'azaldı'}.`);
    } else if (reviews.change.kind === 'new') {
      parts.push('Önceki dönemde yorumun yoktu; yeniden hoş geldin.');
    }
  }
  return parts.join(' ');
}
