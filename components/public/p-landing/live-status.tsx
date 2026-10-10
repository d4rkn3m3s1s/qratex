'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmt, type PublicLocale } from './fmt';
import type { TrustCopy } from './trust-copy';

type StatusState =
  | { kind: 'checking' }
  | { kind: 'ok'; ms: number; at: Date }
  | { kind: 'down'; at: Date }
  | { kind: 'offline' };

const TIMEOUT_MS = 8000;

/**
 * Canlı sistem durumu (guven.md envanter #24 "canlı durum", Bulgu 2): ölçülmeyen
 * "%99.9 uptime / p95 < 300ms" iddiaları yerine sayfa açıldığı anda gerçek bir sağlık
 * kontrolü (`/api/health?light=1`, yalnız DB ping; yanıt minimal, recon yüzeyi açmaz).
 * Sonuç `aria-live` ile duyurulur; ağ hatası "kesinti" diye yanlış raporlanmaz.
 */
export function LiveStatus({ copy, locale }: { copy: TrustCopy['status']; locale: PublicLocale }) {
  const [state, setState] = useState<StatusState>({ kind: 'checking' });
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    setState({ kind: 'checking' });
    try {
      const res = await fetch('/api/health?light=1', { cache: 'no-store', signal: ctrl.signal });
      const body = (await res.json().catch(() => null)) as { status?: string; latencyMs?: number } | null;
      if (abortRef.current !== ctrl) return;
      if (res.ok && body?.status === 'ok') {
        setState({ kind: 'ok', ms: Math.max(0, Math.round(body.latencyMs ?? 0)), at: new Date() });
      } else if (res.status >= 500) {
        setState({ kind: 'down', at: new Date() });
      } else {
        setState({ kind: 'offline' });
      }
    } catch {
      if (abortRef.current === ctrl) setState({ kind: 'offline' });
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void check();
    return () => abortRef.current?.abort();
  }, [check]);

  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);

  const view =
    state.kind === 'ok'
      ? { icon: CheckCircle2, tone: 'border-success-border bg-success-subtle', iconTone: 'text-success', title: copy.ok, detail: fmt(copy.okDetail, { ms: state.ms, time: time(state.at) }) }
      : state.kind === 'down'
        ? { icon: AlertTriangle, tone: 'border-danger-border bg-danger-subtle', iconTone: 'text-danger', title: copy.down, detail: fmt(copy.downDetail, { time: time(state.at) }) }
        : state.kind === 'offline'
          ? { icon: WifiOff, tone: 'border-warning-border bg-warning-subtle', iconTone: 'text-warning', title: copy.offline, detail: '' }
          : { icon: Activity, tone: 'border-subtle bg-surface-1', iconTone: 'text-fg-muted', title: copy.checking, detail: '' };
  const Icon = view.icon;

  return (
    <div className={cn('rounded-card border p-5 transition-colors duration-base ease-standard', view.tone)}>
      <p className="qx-overline text-fg-muted">{copy.title}</p>
      <div className="mt-3 flex items-start gap-3" role="status" aria-live="polite" aria-atomic="true">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', view.iconTone)} aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-fg">{view.title}</p>
          {view.detail ? <p className="qx-num mt-1 text-sm text-fg-muted">{view.detail}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-subtle">{copy.note}</p>
        <Button type="button" variant="outline" onClick={() => void check()} disabled={state.kind === 'checking'}>
          <RefreshCw className={cn('h-4 w-4', state.kind === 'checking' && 'motion-safe:animate-spin')} aria-hidden />
          {copy.retry}
        </Button>
      </div>
    </div>
  );
}
