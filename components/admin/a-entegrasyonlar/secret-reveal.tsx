'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { m as Motion } from 'framer-motion';
import { Copy, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TONE_CALLOUT } from '@/components/states';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { DrawCheck } from '@/components/fx/event-fx';
import { copyText } from './api';

/**
 * Tek seferlik sır paneli (API anahtarı / webhook imza sırrı). Stripe/GitHub kalıbı:
 * maskeli alan + göster/gizle, kopyala (başarısızsa metin seçili bırakılır ve söylenir),
 * kullanım örneği, "güvenli bir yere kaydettim" onayı olmadan kapatılamaz.
 * Kapanınca ham değer çağıranın state'inden silinir.
 */
export function SecretReveal({
  label,
  value,
  example,
  warning,
  onDone,
  doneLabel = 'Kaydettim, kapat',
}: {
  label: string;
  value: string;
  example?: ReactNode;
  warning?: ReactNode;
  onDone: () => void;
  doneLabel?: string;
}) {
  const reduce = useReducedMotionPref();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const [ack, setAck] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  async function copy() {
    const okCopy = await copyText(value);
    if (okCopy) {
      setCopied('ok');
      window.setTimeout(() => setCopied('idle'), 2000);
    } else {
      setCopied('failed');
      setShown(true);
      window.setTimeout(() => inputRef.current?.select(), 0);
    }
  }

  return (
    <div className="space-y-4">
      <Motion.div
        initial={reduce ? false : { boxShadow: '0 0 0 0 rgba(217,119,6,0)' }}
        animate={reduce ? undefined : { boxShadow: ['0 0 0 0 rgba(217,119,6,0)', '0 0 0 6px rgba(217,119,6,0.25)', '0 0 0 0 rgba(217,119,6,0)'] }}
        transition={{ duration: DURATION.celebrate, ease: EASE.standard }}
        className={cn('rounded-card border p-3 text-sm', TONE_CALLOUT.warning)}
        role="status"
      >
        <p className="flex items-start gap-2 font-medium">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {warning ?? 'Bu değer yalnız şimdi gösterilir. Kapattıktan sonra hiçbir yerde tekrar görülemez.'}
        </p>
      </Motion.div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-secret`}>{label}</Label>
        <div className="flex gap-2">
          <input
            id={`${id}-secret`}
            ref={inputRef}
            readOnly
            type={shown ? 'text' : 'password'}
            value={value}
            autoComplete="off"
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full min-w-0 rounded-control border border-border bg-surface-muted px-3 font-mono text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="button" variant="outline" className="min-h-11 min-w-11 px-3" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Gizle' : 'Göster'} aria-pressed={shown}>
            {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </Button>
          <Button type="button" className="min-h-11" onClick={copy}>
            {copied === 'ok' ? <DrawCheck circle={false} className="h-4 w-4" /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied === 'ok' ? 'Kopyalandı' : 'Kopyala'}
          </Button>
        </div>
        <p aria-live="polite" className={cn('min-h-5 text-xs', copied === 'failed' ? 'text-danger' : 'text-fg-muted')}>
          {copied === 'failed'
            ? 'Panoya erişilemedi. Metin seçildi; Ctrl+C (Mac: ⌘C) ile kopyalayın.'
            : copied === 'ok'
              ? 'Panoya kopyalandı.'
              : ''}
        </p>
      </div>

      {example}

      <div className="flex items-start gap-3 rounded-control border border-border p-3">
        <Checkbox id={`${id}-ack`} checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
        <Label htmlFor={`${id}-ack`} className="cursor-pointer text-sm leading-snug">
          Değeri güvenli bir yere (parola yöneticisi / gizli değişken) kaydettim.
        </Label>
      </div>

      <div className="flex justify-end">
        <Button type="button" className="min-h-11" disabled={!ack} onClick={onDone}>
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}

/** Kod örneği bloğu (kopyalanabilir). */
export function CodeBlock({ title, code }: { title: string; code: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'failed'>('idle');
  return (
    <figure className="overflow-hidden rounded-control border border-border">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-fg-muted">
        <span>{title}</span>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={async () => {
            const r = await copyText(code);
            setState(r ? 'ok' : 'failed');
            window.setTimeout(() => setState('idle'), 2000);
          }}
          aria-label={`${title} örneğini kopyala`}
        >
          {state === 'ok' ? <DrawCheck circle={false} className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          <span aria-live="polite">{state === 'ok' ? 'Kopyalandı' : state === 'failed' ? 'Kopyalanamadı' : 'Kopyala'}</span>
        </button>
      </figcaption>
      <pre className="max-h-72 overflow-auto bg-surface-1 p-3 text-xs leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
