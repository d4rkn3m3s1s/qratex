'use client';

import { forwardRef, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nextIstanbulMidnight, nextIstanbulWeekStart, splitDuration, type CountdownParts } from './istanbul-time';
import { useRegister, type Register } from './register';
import { usePlayLocale } from './locale';
import type { PlayLocale, PlaySize } from './shared';

export type CountdownMode = 'day' | 'week';

export type CountdownChipProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** `day` → İstanbul gün sonu (00:00) · `week` → İstanbul Pazartesi 00:00. Varsayılan `day`. */
  mode?: CountdownMode;
  /** Sabit bitiş anı (etkinlik/sezon sonu). Verilirse `mode` yok sayılır ve süre dolunca durur. */
  target?: Date | string | number;
  /** Ön etiket. Varsayılan: "Gün sonuna" / "Haftalık sıfırlamaya" / "Bitişe". `null` → gizli. */
  label?: ReactNode | null;
  /** Süre dolduğunda (bir kez). `mode` kullanılıyorsa sayaç bir sonraki sıfırlamaya geçer. */
  onExpire?: () => void;
  /** Bu süreden az kalınca vurgulu ton (ms). Varsayılan 1 saat. */
  urgentWithinMs?: number;
  size?: Exclude<PlaySize, 'lg'>;
  register?: Register;
  /** Dil; verilmezse uygulama dili (`AppLocaleProvider`, yoksa `tr`). */
  locale?: PlayLocale;
};

const COPY: Record<
  PlayLocale,
  {
    day: string;
    week: string;
    target: string;
    expired: string;
    short: (p: CountdownParts) => string;
    long: (p: CountdownParts) => string;
  }
> = {
  tr: {
    day: 'Gün sonuna',
    week: 'Haftalık sıfırlamaya',
    target: 'Bitişe',
    expired: 'Süre doldu',
    short: (p) =>
      p.days > 0
        ? `${p.days} g ${p.hours} sa`
        : p.hours > 0
          ? `${p.hours} sa ${p.minutes} dk`
          : `${pad(p.minutes)}:${pad(p.seconds)}`,
    long: (p) =>
      p.days > 0
        ? `${p.days} gün ${p.hours} saat`
        : p.hours > 0
          ? `${p.hours} saat ${p.minutes} dakika`
          : `${p.minutes} dakika ${p.seconds} saniye`,
  },
  en: {
    day: 'Day ends in',
    week: 'Weekly reset in',
    target: 'Ends in',
    expired: 'Ended',
    short: (p) =>
      p.days > 0 ? `${p.days}d ${p.hours}h` : p.hours > 0 ? `${p.hours}h ${p.minutes}m` : `${pad(p.minutes)}:${pad(p.seconds)}`,
    long: (p) =>
      p.days > 0
        ? `${p.days} days ${p.hours} hours`
        : p.hours > 0
          ? `${p.hours} hours ${p.minutes} minutes`
          : `${p.minutes} minutes ${p.seconds} seconds`,
  },
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function resolveTarget(mode: CountdownMode, target: CountdownChipProps['target'], now: Date): Date {
  if (target != null) {
    const d = target instanceof Date ? target : new Date(target);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return mode === 'week' ? nextIstanbulWeekStart(now) : nextIstanbulMidnight(now);
}

const SIZE = {
  sm: { root: 'h-7 gap-1 px-2 qx-caption', icon: 'size-3.5' },
  md: { root: 'h-8 gap-1.5 px-3 qx-small', icon: 'size-4' },
} as const;

/**
 * Europe/Istanbul gün sonu / haftalık sıfırlama sayacı. Bir saatten az kalınca
 * saniye gösterir; aksi halde dakika sınırında güncellenir. Sekme gizliyken
 * zamanlayıcı durur, geri dönüldüğünde yeniden hesaplanır. Sunucu çıktısı
 * sabit yer tutucudur (hidrasyon uyuşmazlığı yok).
 */
export const CountdownChip = forwardRef<HTMLSpanElement, CountdownChipProps>(function CountdownChip(
  {
    mode = 'day',
    target,
    label,
    onExpire,
    urgentWithinMs = 3_600_000,
    size = 'md',
    register,
    locale: localeProp,
    className,
    ...rest
  },
  ref,
) {
  const locale = usePlayLocale(localeProp);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const reg = useRegister(register, rootRef);
  const [tick, setTick] = useState<{ now: number; end: Date } | null>(null);
  const targetKey = target instanceof Date ? target.getTime() : target;
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let endAt = resolveTarget(mode, targetKey, new Date());
    let timer: ReturnType<typeof setTimeout> | null = null;
    let expiredFired = false;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (typeof document !== 'undefined' && document.hidden) return;
      const t = Date.now();
      let end = endAt;
      let remaining = end.getTime() - t;
      if (remaining <= 0) {
        if (!expiredFired) {
          expiredFired = true;
          onExpireRef.current?.();
        }
        if (targetKey != null) {
          setTick({ now: t, end });
          return; // sabit hedef: dur
        }
        end = resolveTarget(mode, undefined, new Date(t + 1000));
        endAt = end;
        expiredFired = false;
        remaining = end.getTime() - t;
      }
      setTick({ now: t, end });
      const delay = remaining < 3_600_000 ? remaining % 1000 || 1000 : remaining % 60_000 || 60_000;
      timer = setTimeout(schedule, Math.min(delay + 20, 60_000));
    };

    schedule();
    const onVis = () => schedule();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mode, targetKey]);

  const copy = COPY[locale];
  const end = tick?.end ?? null;
  const parts = tick ? splitDuration(tick.end.getTime() - tick.now) : null;
  const expired = parts != null && parts.totalMs <= 0;
  const urgent = parts != null && !expired && parts.totalMs < urgentWithinMs;
  const prefix = label === undefined ? (target != null ? copy.target : mode === 'week' ? copy.week : copy.day) : label;
  const s = SIZE[size];
  const play = reg === 'play';

  const visible = parts == null ? '--:--' : expired ? copy.expired : copy.short(parts);
  const spoken =
    parts == null
      ? undefined
      : expired
        ? copy.expired
        : `${typeof prefix === 'string' ? `${prefix} ` : ''}${copy.long(parts)}`;

  return (
    <span
      {...rest}
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      role="timer"
      aria-label={spoken}
      data-urgent={urgent || undefined}
      className={cn(
        'inline-flex select-none items-center whitespace-nowrap rounded-full ring-1 ring-inset transition-colors duration-fast ease-standard',
        s.root,
        urgent || expired
          ? 'bg-warning-subtle text-warning ring-warning-border'
          : play
            ? 'bg-brand-subtle text-brand ring-brand-border'
            : 'bg-surface-muted text-fg-muted ring-border',
        className,
      )}
    >
      <Timer aria-hidden className={cn(s.icon, 'shrink-0')} />
      {prefix != null && (
        <span aria-hidden className="font-medium">
          {prefix}
        </span>
      )}
      <time
        aria-hidden
        dateTime={end && !expired ? end.toISOString() : undefined}
        className="qx-num font-semibold tabular-nums"
      >
        {visible}
      </time>
    </span>
  );
});
