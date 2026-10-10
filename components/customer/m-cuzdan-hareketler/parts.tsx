'use client';

/**
 * Hareketler/Bağış ortak küçük parçaları (ops kaydı: düz yüzey, rol token'ları, tabular rakam).
 */
import { useState, type ReactNode } from 'react';
import {
  Coins,
  Gamepad2,
  Gift,
  Heart,
  MessageSquare,
  ShoppingBag,
  Store,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourceGroup } from '@/lib/customer-wallet/activity/sources';
import { initialOf } from './format';

export const GROUP_ICONS: Record<SourceGroup | 'other', LucideIcon> = {
  feedback: MessageSquare,
  visit: Store,
  game: Gamepad2,
  mission: Target,
  social: Users,
  bonus: Gift,
  spend: ShoppingBag,
  adjust: Wrench,
  other: Coins,
};

export function iconForSource(source: string, group: SourceGroup | 'other'): LucideIcon {
  if (source === 'donation') return Heart;
  return GROUP_ICONS[group];
}

/** Yoğun istatistik şeridi — `dl` (başlık değil; denetim B10). */
export function StatStrip({
  items,
  className,
  label,
}: {
  items: Array<{ id: string; label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'success' }>;
  className?: string;
  label?: string;
}) {
  return (
    <dl
      aria-label={label}
      className={cn('grid grid-cols-3 divide-x divide-subtle rounded-card border border-subtle bg-surface-1', className)}
    >
      {items.map((it) => (
        <div key={it.id} className="min-w-0 px-3 py-3 sm:px-4">
          <dt className="qx-caption truncate text-fg-muted">{it.label}</dt>
          <dd className={cn('qx-num mt-1 truncate text-lg font-semibold sm:text-xl', it.tone === 'success' ? 'text-success' : 'text-fg')}>
            {it.value}
          </dd>
          {it.hint ? <dd className="qx-caption mt-0.5 truncate text-fg-subtle">{it.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** İşletme logosu; kırık/boş URL'de baş harf yedeği (denetim #19 / B8). */
export function PlaceAvatar({ name, logo, locale, size = 40 }: { name: string | null; logo: string | null; locale: 'tr' | 'en'; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- harici işletme logosu; boyut sabit, tembel yükleme
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-control border border-subtle bg-surface-muted object-cover"
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-control border border-subtle bg-surface-muted font-semibold text-fg-muted"
      style={style}
    >
      {name ? initialOf(name, locale) : <Store className="h-4 w-4" />}
    </span>
  );
}

/** Kare ikon kutusu (satır başı). */
export function IconTile({ icon: Icon, tone = 'neutral' }: { icon: LucideIcon; tone?: 'neutral' | 'success' | 'brand' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-control',
        tone === 'success' && 'bg-success-subtle text-success',
        tone === 'brand' && 'bg-brand-subtle text-brand',
        tone === 'neutral' && 'bg-surface-muted text-fg-muted',
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Gün/ay başlığı (yapışkan değil; liste ritmi). */
export function GroupHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="qx-overline px-1 pb-1 pt-4 text-fg-muted first:pt-0">
      {children}
    </h2>
  );
}

/** 5 üzerinden yıldız (metin + ikon; yalnız renge dayanmaz). */
export function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label}>
      <span aria-hidden className="text-warning">
        {'★'.repeat(value)}
        <span className="text-fg-subtle">{'★'.repeat(Math.max(0, 5 - value))}</span>
      </span>
      <span aria-hidden className="qx-caption qx-num text-fg-muted">
        {value}/5
      </span>
    </span>
  );
}
