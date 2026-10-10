'use client';

import { useMemo } from 'react';
import { AlertTriangle, Crown, HeartHandshake, Moon, ShieldAlert, Sprout, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CALLOUT, type Tone } from '@/components/states';
import { StatusBadge } from '@/components/ds/data';
import type { CustomerTag, RiskLevel, WinBackBand } from '@/lib/dealer-customers/types';
import { useCustomersCopy, useCustomersLocale } from './copy';

/* ───────────────────────── Biçim ───────────────────────── */

export function useFormat() {
  const locale = useCustomersLocale();
  return useMemo(() => makeFormat(locale), [locale]);
}

function makeFormat(locale: 'tr' | 'en') {
  const tag = locale === 'en' ? 'en-GB' : 'tr-TR';
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  const money2 = new Intl.NumberFormat(tag, { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  return {
    money: (n: number | null | undefined) => (n == null ? '—' : money.format(n)),
    money2: (n: number | null | undefined) => (n == null ? '—' : money2.format(n)),
    number: (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString(tag)),
    percent: (ratio: number | null | undefined) =>
      ratio == null ? '—' : locale === 'en' ? `${Math.round(ratio * 100)}%` : `%${Math.round(ratio * 100)}`,
    date: (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : '—'),
    /** "bugün", "dün", "12 gün önce", "3 saat önce". */
    relative: (iso: string | null | undefined, now: number = Date.now()) => {
      if (!iso) return '—';
      const diff = new Date(iso).getTime() - now;
      const abs = Math.abs(diff);
      if (abs < 60 * 60 * 1000) return rtf.format(Math.round(diff / 60_000), 'minute');
      if (abs < 24 * 60 * 60 * 1000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
      const days = Math.round(diff / 86_400_000);
      if (Math.abs(days) < 45) return rtf.format(days, 'day');
      if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
      return rtf.format(Math.round(days / 365), 'year');
    },
    days: (d: number | null | undefined) => {
      if (d == null) return '—';
      if (d === 0) return rtf.format(0, 'day');
      return rtf.format(-d, 'day');
    },
  };
}

/* ───────────────────────── Rozetler ───────────────────────── */

const TAG_TONE: Record<CustomerTag, Tone> = { at_risk: 'danger', vip: 'brand', loyal: 'success', dormant: 'warning', new: 'info' };
const TAG_ICON = { at_risk: ShieldAlert, vip: Crown, loyal: HeartHandshake, dormant: Moon, new: Sprout } as const;

export function TagChips({ tags, size = 'sm', max = 3 }: { tags: readonly CustomerTag[]; size?: 'sm' | 'md'; max?: number }) {
  const copy = useCustomersCopy();
  if (tags.length === 0) return <span className="qx-small text-fg-muted">—</span>;
  const shown = tags.slice(0, max);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <StatusBadge key={t} label={copy.tag[t]} tone={TAG_TONE[t]} icon={TAG_ICON[t]} size={size} />
      ))}
      {tags.length > max && <span className="qx-caption self-center text-fg-muted">+{tags.length - max}</span>}
    </span>
  );
}

export function tagTone(tag: CustomerTag): Tone {
  return TAG_TONE[tag];
}
export function tagIcon(tag: CustomerTag) {
  return TAG_ICON[tag];
}

const RISK_TONE: Record<RiskLevel, Tone> = { high: 'danger', medium: 'warning', low: 'success', unknown: 'neutral' };

/** Risk: ikon + Türkçe etiket + yüzde (yalnız renge dayanmaz; veri yokken nötr "Veri yok"). */
export function RiskPill({ level, value, size = 'sm' }: { level: RiskLevel; value: number | null; size?: 'sm' | 'md' }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const label = level === 'unknown' ? copy.risk.unknown : `${copy.risk[level]} · ${fmt.percent(value)}`;
  return <StatusBadge label={label} tone={RISK_TONE[level]} icon={level === 'unknown' ? null : AlertTriangle} size={size} srPrefix={copy.colRisk} />;
}

const BAND_TONE: Record<WinBackBand, Tone> = { waking: 'warning', sleeping: 'info', lost: 'neutral' };

export function BandBadge({ band, size = 'sm' }: { band: WinBackBand; size?: 'sm' | 'md' }) {
  const copy = useCustomersCopy();
  return <StatusBadge label={copy.band[band]} tone={BAND_TONE[band]} icon={Moon} size={size} title={copy.bandRule[band]} />;
}

/* ───────────────────────── Müşteri hücresi ───────────────────────── */

export function CustomerAvatar({ name, image, anonymized, className }: { name: string | null; image: string | null; anonymized: boolean; className?: string }) {
  const initials = !anonymized && name ? name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr-TR')).join('') : '';
  return (
    <span
      aria-hidden
      className={cn('grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-fg-muted qx-small font-semibold', className)}
    >
      {image && !anonymized ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : initials ? (
        initials
      ) : (
        <UserRound className="h-4 w-4" />
      )}
    </span>
  );
}

export function useDisplayName() {
  const copy = useCustomersCopy();
  return (c: { name: string | null; anonymized: boolean }) => (c.anonymized ? copy.anonymous : c.name?.trim() || copy.unnamed);
}

export function CustomerCell({ c, sub }: { c: { name: string | null; image: string | null; anonymized: boolean; email?: string | null }; sub?: string | null }) {
  const display = useDisplayName();
  const secondary = sub ?? c.email ?? null;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <CustomerAvatar name={c.name} image={c.image} anonymized={c.anonymized} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg">{display(c)}</span>
        {secondary && <span className="qx-caption block truncate text-fg-muted">{secondary}</span>}
      </span>
    </span>
  );
}

/** Uyarı/bilgi bandı. */
export function Callout({ tone, children, icon: Icon }: { tone: Tone; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'status' : undefined} className={cn('flex items-start gap-2 rounded-control border px-3 py-2 qx-small', TONE_CALLOUT[tone])}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}
