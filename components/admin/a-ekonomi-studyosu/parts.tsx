'use client';

import * as React from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ErrorState, SkeletonForm, classifyError, TONE_CALLOUT, type Tone } from '@/components/states';
import { Field, NumericInput, parseLocaleNumber, formatNumberDisplay, formatNumberForEditing, roundTo } from '@/components/ds/form';
import type { FieldChange, HistoryEntry, HistoryKind, HistoryPage } from '@/lib/admin-economy/contract';
import { getHistory } from './api';
import type { EditableResource } from './use-editable-resource';

const nf = new Intl.NumberFormat('tr-TR');
export const fmtInt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : nf.format(Math.round(n)));
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `%${n.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}`;
export const fmtMult = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}×`;
const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });
export const fmtDateTime = (iso: string) => dtf.format(new Date(iso));

/**
 * Taslağa bağlı sayı alanı (RHF'siz). Metin serbest yazılır ("1,5" / "1.500"), odak çıkışında
 * aralık denetlenir; boş/geçersiz değer taslağa NaN olarak yazılır ve kaydı engeller
 * (eski sayfadaki "silince 1'e zıplama" ve "80 → 180" kusurları yok).
 */
export function NumField({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  description,
  decimal = false,
  precision = 2,
  disabled,
  hideLabel,
  baseline,
  className,
}: {
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  description?: React.ReactNode;
  decimal?: boolean;
  precision?: number;
  disabled?: boolean;
  hideLabel?: boolean;
  /** Kayıtlı değer — farklıysa alan "değişti" olarak işaretlenir (eski değer gösterilir). */
  baseline?: number;
  className?: string;
}) {
  const [localError, setLocalError] = React.useState<string | null>(null);
  const digits = decimal ? precision : 0;
  const fmt = (v: number) => formatNumberDisplay(v, 'tr', { maxFractionDigits: digits });
  const changed = baseline !== undefined && Number.isFinite(value) && value !== baseline;
  const rangeError =
    Number.isFinite(value) && ((typeof min === 'number' && value < min) || (typeof max === 'number' && value > max))
      ? `${typeof min === 'number' ? fmt(min) : '…'}–${typeof max === 'number' ? fmt(max) : '…'} aralığında olmalı`
      : null;
  const error = localError ?? (!Number.isFinite(value) ? 'Değer gerekli' : rangeError);
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      description={description}
      error={error}
      disabled={disabled}
      className={className}
      labelAside={
        changed ? (
          <span className="qx-caption text-fg-muted">
            önceki <s className="qx-num">{fmt(baseline!)}</s>
          </span>
        ) : undefined
      }
    >
      {(a11y) => (
        <NumericInput
          {...a11y}
          value={Number.isFinite(value) ? value : null}
          onChange={(v) => onChange(v === null ? Number.NaN : v)}
          onLocalError={setLocalError}
          parse={(text) => {
            const p = parseLocaleNumber(text, 'tr');
            if (p.kind === 'empty') return p;
            if (p.kind === 'invalid') return { kind: 'invalid', message: 'Geçerli bir sayı girin' };
            if (!decimal && p.fractionDigits > 0) return { kind: 'invalid', message: 'Tam sayı girin' };
            return { kind: 'ok', value: p.value };
          }}
          toEditText={(v) => formatNumberForEditing(roundTo(v, digits), 'tr')}
          toDisplayText={fmt}
          finalize={(raw) => ({ value: roundTo(raw, digits) })}
          min={min}
          max={max}
          step={decimal ? 0.05 : 1}
          spin
          valueText={unit ? (v) => `${fmt(v)} ${unit}` : undefined}
          incrementLabel="Artır"
          decrementLabel="Azalt"
          inputMode={decimal ? 'decimal' : 'numeric'}
          endAdornment={unit}
          invalid={!!error}
          disabled={disabled}
          className={cn(changed && 'ring-1 ring-brand/60')}
        />
      )}
    </Field>
  );
}

/** Kaynak hazır değilse (yükleniyor/hata) formu GÖSTERMEZ — C2 yükleme kilidi. */
export function ResourceGate<D, M>({
  resource,
  title,
  children,
}: {
  resource: EditableResource<D, M>;
  title: string;
  children: (draft: D, meta: M) => React.ReactNode;
}) {
  if (resource.status === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{title} yükleniyor…</span>
        <SkeletonForm />
      </div>
    );
  }
  if (resource.status === 'error' || resource.draft === null || resource.meta === null) {
    return (
      <ErrorState
        kind={classifyError(resource.error)}
        title={`${title} yüklenemedi`}
        description="Canlı değerler okunamadığı için düzenleme kilitlendi. Kayıtlı ayarlar değişmedi; tekrar deneyin."
        onRetry={() => resource.reload()}
      />
    );
  }
  return <>{children(resource.draft, resource.meta as M)}</>;
}

/** Alan farkları listesi (kaydetmeden önce gözden geçirme ve geçmiş için). */
export function ChangeList({ changes, labelOf, max = 12 }: { changes: FieldChange[]; labelOf?: (path: string) => string; max?: number }) {
  if (changes.length === 0) return <p className="qx-small text-fg-muted">Alan değişikliği yok.</p>;
  return (
    <ul className="space-y-1">
      {changes.slice(0, max).map((c) => (
        <li key={c.path} className="qx-small flex flex-wrap items-baseline gap-x-2">
          <span className="text-fg-muted">{labelOf ? labelOf(c.path) : c.path}</span>
          <span className="qx-num">
            <s className="text-fg-muted">{c.before}</s> → <strong className="text-fg">{c.after}</strong>
          </span>
        </li>
      ))}
      {changes.length > max && <li className="qx-caption text-fg-muted">… ve {changes.length - max} değişiklik daha</li>}
    </ul>
  );
}

/**
 * Değişiklik geçmişi (AuditLog). Açılınca yüklenir; her kayıt "Taslağa yükle" ile geri
 * yüklenebilir — doğrudan yazmaz, gözden geçirip normal kaydetme yolundan (baseVersion) yayınlanır.
 */
export function HistoryPanel({
  kind,
  labelOf,
  onLoadSnapshot,
  refreshKey,
}: {
  kind: HistoryKind;
  labelOf?: (path: string) => string;
  onLoadSnapshot?: (entry: HistoryEntry) => void;
  /** Kaydetme sonrası yeniden yüklemek için değişen anahtar (sürüm). */
  refreshKey?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [state, setState] = React.useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data?: HistoryPage; error?: unknown }>({ status: 'idle' });
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: 'loading' }));
    getHistory(kind, page, ctrl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error) => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        setState({ status: 'error', error });
      });
    return () => ctrl.abort();
  }, [open, kind, page, refreshKey]);

  const pages = state.data ? Math.max(1, Math.ceil(state.data.total / state.data.size)) : 1;

  return (
    <div className="rounded-card border border-subtle bg-surface-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="qx-small inline-flex items-center gap-2 font-medium">
          <History className="h-4 w-4 text-fg-muted" aria-hidden />
          Değişiklik geçmişi
        </span>
        <span className="qx-caption text-fg-muted">{open ? 'Gizle' : 'Göster'}</span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-subtle px-4 py-3" aria-live="polite" aria-busy={state.status === 'loading'}>
          {state.status === 'loading' && !state.data && <p className="qx-small text-fg-muted">Geçmiş yükleniyor…</p>}
          {state.status === 'error' && (
            <ErrorState
              kind={classifyError(state.error)}
              title="Geçmiş yüklenemedi"
              onRetry={() => setState({ status: 'idle' })}
              headingLevel="p"
            />
          )}
          {state.data && state.data.items.length === 0 && (
            <p className="qx-small text-fg-muted">Henüz kayıtlı değişiklik yok. İlk kaydınız burada görünecek.</p>
          )}
          {state.data && state.data.items.length > 0 && (
            <ol className={cn('space-y-3', state.status === 'loading' && 'opacity-60')}>
              {state.data.items.map((e) => (
                <li key={e.id} className="rounded-control border border-subtle p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="qx-small">
                      <strong>{e.actor}</strong> <span className="text-fg-muted">· {fmtDateTime(e.at)}</span>
                    </p>
                    {onLoadSnapshot && e.snapshot != null && (
                      <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => onLoadSnapshot(e)}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Taslağa yükle
                      </Button>
                    )}
                  </div>
                  <ChangeList changes={e.changes} labelOf={labelOf} max={8} />
                </li>
              ))}
            </ol>
          )}
          {state.data && pages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Önceki
              </Button>
              <span className="qx-caption qx-num text-fg-muted">
                {page} / {pages}
              </span>
              <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Sonraki
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Kısa bilgi kutusu (ops kaydı: sakin). */
export function Callout({ tone = 'info', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <div className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT[tone], className)}>{children}</div>;
}
