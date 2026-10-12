'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Ban, CheckCircle2, Loader2, Search, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, defineStatusMap, statusBadgeProps } from '@/components/ds/data';
import { TONE_CHIP } from '@/components/states';
import {
  AGENT_PROFILES,
  STATUS_LABEL,
  formatIstanbul,
  type CouncilAgent,
  type DealerOption,
  type SessionStatus,
} from '@/lib/council/contract';
import { councilKeys, errorText, searchDealers } from './api';

export const SESSION_STATUS_MAP = defineStatusMap<SessionStatus>({
  running: { label: STATUS_LABEL.running, tone: 'info', icon: Loader2 },
  completed: { label: STATUS_LABEL.completed, tone: 'success', icon: CheckCircle2 },
  failed: { label: STATUS_LABEL.failed, tone: 'danger', icon: XCircle },
  cancelled: { label: STATUS_LABEL.cancelled, tone: 'neutral', icon: Ban },
  archived: { label: STATUS_LABEL.archived, tone: 'neutral', icon: Archive },
});

export function SessionStatusBadge({ status, size = 'sm' }: { status: SessionStatus; size?: 'sm' | 'md' }) {
  return <StatusBadge {...statusBadgeProps(SESSION_STATUS_MAP, status)} size={size} srPrefix="Durum" />;
}

export function AgentAvatar({ agent, size = 'md', active = false }: { agent: string; size?: 'sm' | 'md'; active?: boolean }) {
  const p = AGENT_PROFILES[agent as CouncilAgent];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition-shadow duration-base',
        size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm',
        p ? TONE_CHIP[p.tone] : TONE_CHIP.neutral,
        active && 'ring-2 ring-focus ring-offset-2 ring-offset-surface-1'
      )}
    >
      {p?.initial ?? agent.slice(0, 1).toUpperCase()}
    </span>
  );
}

const REL = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

/** Göreli zaman ("3 saat önce"); title'da İstanbul saatiyle tam tarih. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  let text = formatIstanbul(iso);
  if (now != null) {
    const diff = (new Date(iso).getTime() - now) / 1000;
    const abs = Math.abs(diff);
    if (abs < 60) text = 'az önce';
    else if (abs < 3600) text = REL.format(Math.round(diff / 60), 'minute');
    else if (abs < 86400) text = REL.format(Math.round(diff / 3600), 'hour');
    else if (abs < 86400 * 7) text = REL.format(Math.round(diff / 86400), 'day');
  }
  return (
    <time dateTime={iso} title={`${formatIstanbul(iso)} (İstanbul)`} className={className}>
      {text}
    </time>
  );
}

/** Sunucu aramalı hafif bayi seçici (en fazla 20 sonuç). */
export function DealerPicker({
  value,
  onChange,
  label = 'Bayi',
  invalid,
}: {
  value: DealerOption | null;
  onChange: (d: DealerOption | null) => void;
  label?: string;
  invalid?: boolean;
}) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const q = useQuery({
    queryKey: councilKeys.dealers(debounced),
    queryFn: ({ signal }) => searchDealers(debounced, signal),
    enabled: !value,
    staleTime: 60_000,
  });

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm">
        <span className="font-medium text-fg">{value.label}</span>
        {value.secondary ? <span className="text-fg-muted">{value.secondary}</span> : null}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9"
        >
          Değiştir
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          id={id}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="İşletme adı, kişi ya da e-posta ile ara"
          aria-invalid={invalid || undefined}
          aria-controls={`${id}-list`}
          className="h-11 w-full rounded-md border border-border bg-surface-1 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </div>
      <div id={`${id}-list`} aria-live="polite" className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface-1">
        {q.isLoading ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-fg-muted">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Bayiler aranıyor…
          </p>
        ) : q.isError ? (
          <p role="alert" className="px-3 py-3 text-sm text-danger">
            {errorText(q.error, 'Bayi listesi yüklenemedi.')}{' '}
            <button type="button" className="font-medium underline" onClick={() => q.refetch()}>
              Tekrar dene
            </button>
          </p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="px-3 py-3 text-sm text-fg-muted">{debounced ? 'Bu aramayla eşleşen bayi yok.' : 'Kayıtlı bayi yok.'}</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onChange(d)}
                  className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <span className="font-medium text-fg">{d.label}</span>
                  {d.secondary ? <span className="text-xs text-fg-muted">{d.secondary}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
