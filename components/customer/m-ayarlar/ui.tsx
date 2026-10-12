'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { playSound } from '@/lib/sound';
import { useSettingsCopy } from './copy';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Satır başına kayıt durumu: "Kaydediliyor…" → 1,6 sn "Kaydedildi" → boş. Hata kalıcıdır
 * (kullanıcı görsün); bir sonraki denemede temizlenir.
 */
export function useSaveState() {
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (timer.current) window.clearTimeout(timer.current);
    setState('saving');
    setMessage(null);
    try {
      const out = await task();
      setState('saved');
      timer.current = window.setTimeout(() => setState('idle'), 1600);
      return out;
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : null);
      return undefined;
    }
  }, []);
  return { state, message, run, setState, setMessage };
}

/** Satır sonundaki küçük durum göstergesi (canlı bölge: ekran okuyucu duyurur). */
export function SaveIndicator({ state, error }: { state: SaveState; error?: string | null }) {
  const { copy } = useSettingsCopy();
  return (
    <span role="status" aria-live="polite" className="qx-caption inline-flex min-h-5 items-center gap-1">
      {state === 'saving' ? (
        <span className="inline-flex items-center gap-1 text-fg-muted">
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          {copy.saving}
        </span>
      ) : state === 'saved' ? (
        <span className="inline-flex items-center gap-1 text-success transition-opacity duration-fast ease-standard">
          <Check aria-hidden className="h-3.5 w-3.5" />
          {copy.saved}
        </span>
      ) : state === 'error' ? (
        <span className="inline-flex items-center gap-1 text-danger">
          <AlertCircle aria-hidden className="h-3.5 w-3.5" />
          {error || copy.saveError}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Anahtarlı ayar satırı: tüm satır etikete bağlı (≥ 44px dokunma alanı), açıklama
 * `aria-describedby` ile bağlı, durum satır altında.
 */
export function SettingSwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  state = 'idle',
  error,
  disabled,
  icon,
  ariaLabel,
}: {
  /** Görünür etiket yetmediğinde (ör. matris hücresi: "Kampanyalar — Uygulama içi"). */
  ariaLabel?: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  state?: SaveState;
  error?: string | null;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="flex min-h-11 items-start gap-3 py-3">
      {icon ? (
        <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-base font-medium text-fg">
          {label}
        </label>
        {description ? (
          <p id={descId} className="qx-small mt-0.5 text-fg-muted">
            {description}
          </p>
        ) : null}
        <SaveIndicator state={state} error={error} />
      </div>
      <div className="flex min-h-11 shrink-0 items-center">
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={(next) => {
            playSound('toggle');
            onCheckedChange(next);
          }}
          disabled={disabled || state === 'saving'}
          aria-label={ariaLabel}
          aria-describedby={description ? descId : undefined}
        />
      </div>
    </div>
  );
}

/** Sakin ops kartı (SectionCard'ın hafif kardeşi, iç içe kullanım için). */
export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  tone,
  className,
  headingId,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: 'danger';
  className?: string;
  headingId?: string;
}) {
  const fallbackId = useId();
  const hid = headingId ?? fallbackId;
  return (
    <section
      aria-labelledby={hid}
      className={cn(
        'min-w-0 rounded-card border bg-surface-1 p-4 text-fg qx-elevation-1 sm:p-5',
        tone === 'danger' ? 'border-danger-border' : 'border-subtle',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              aria-hidden
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-control [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]',
                tone === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-brand-subtle text-brand',
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={hid} className="qx-h3 text-fg">
              {title}
            </h2>
            {description ? <p className="qx-small mt-0.5 text-fg-muted">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children != null ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export const dateFormatter = (locale: 'tr' | 'en', opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', ...opts });
