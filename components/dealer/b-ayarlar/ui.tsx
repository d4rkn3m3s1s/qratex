'use client';

import { useId, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { errorText } from './api';
import { useSettingsCopy } from './copy';

/**
 * Anında kaydedilen anahtar satırı (bildirim/AI tercihleri). Satırın tamamı ≥ 44px; etiket
 * tıklanabilir; anahtar `aria-describedby` ile açıklamaya bağlı. İyimser: değişim hemen görünür,
 * sunucu reddederse eski değere döner ve hata gösterilir (sahte "kaydedildi" yok).
 */
export function InstantSwitchRow({
  label,
  description,
  checked,
  onSave,
  disabled,
  muted,
  icon,
  badge,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onSave: (next: boolean) => Promise<unknown>;
  disabled?: boolean;
  /** Ana anahtar kapalıyken: değer korunur ama etkisiz olduğu gösterilir. */
  muted?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
}) {
  const id = useId();
  const copy = useSettingsCopy();
  const [pending, setPending] = useState<boolean | null>(null);
  const value = pending ?? checked;

  const change = async (next: boolean) => {
    setPending(next);
    try {
      await onSave(next);
    } catch (e) {
      toast.error(errorText(e, copy.common.saveFailed));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={cn('flex min-h-11 items-start gap-3 py-3', muted && 'opacity-60')}>
      {icon && (
        <span aria-hidden className="mt-1 inline-flex shrink-0 text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="qx-body flex flex-wrap items-center gap-2 font-medium text-fg">
          {label}
          {badge}
        </label>
        {description && (
          <p id={`${id}-d`} className="qx-small mt-0.5 text-fg-muted">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {pending !== null && <Loader2 className="h-4 w-4 animate-spin text-fg-muted" aria-hidden />}
        <Switch
          id={id}
          checked={value}
          disabled={disabled || pending !== null}
          onCheckedChange={(v) => void change(v)}
          aria-describedby={description ? `${id}-d` : undefined}
        />
      </div>
    </div>
  );
}

/** Basit etiket/değer satırı (durum özetleri). */
export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <dt className="qx-small text-fg-muted">{label}</dt>
      <dd className="qx-small min-w-0 text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

/** Kota/kullanım ölçeri (`role="meter"`). `limit === null` → sınırsız. */
export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const id = useId();
  const c = useSettingsCopy().common;
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = limit == null ? 'bg-brand' : pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-brand';
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span id={id} className="qx-small font-medium text-fg">
          {label}
        </span>
        <span className="qx-small qx-num text-fg-muted">
          {used.toLocaleString('tr-TR')} / {limit == null ? c.unlimited : limit.toLocaleString('tr-TR')}
        </span>
      </div>
      {limit != null ? (
        <div
          role="meter"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={`${used} / ${limit}`}
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={cn('h-full rounded-full transition-[width] duration-slow ease-standard', tone)} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="qx-caption text-fg-muted">{c.noLimit}</p>
      )}
      {limit != null && pct >= 80 && (
        <p className={cn('qx-caption', pct >= 100 ? 'text-danger' : 'text-warning')}>
          {pct >= 100 ? c.limitReached : c.limitNear}
        </p>
      )}
    </div>
  );
}
