'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Inbox, ShieldAlert, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, TONE_TEXT, type Tone } from '@/components/states';
import type { QueueGroup, QueueSection } from '@/lib/admin-command/types';
import { formatInt } from './format';

const ICONS: Record<QueueGroup['id'], typeof Inbox> = { dsr: Scale, cases: ShieldAlert, review: Inbox };

/**
 * Kuyruk sayaçları (DSR SLA, vakalar, inceleme). Her satır ilgili kuyruğa gider.
 * Renk tek kanal değildir: sayı + metin + ton; sıfır satırlar sönük ama görünür.
 */
export function QueuePanel({ data }: { data: QueueSection }) {
  return (
    <div className="space-y-3">
      {data.attention === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-success-border bg-success-subtle px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Acil müdahale bekleyen kayıt yok: süresi geçen KVKK talebi, yüksek önemli vaka ya da çözülmemiş güvenlik uyarısı bulunmuyor.
        </p>
      ) : (
        <p role="status" className="flex items-center gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
          {formatInt(data.attention)} kayıt acil müdahale bekliyor.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {data.groups.map((g) => {
          const Icon = ICONS[g.id];
          return (
            <section key={g.id} aria-labelledby={`q-${g.id}`} className="flex flex-col rounded-lg border border-border bg-surface-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md', TONE_CHIP[g.tone as Tone])}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 id={`q-${g.id}`} className="text-sm font-semibold text-fg">
                      {g.title}
                    </h3>
                    <p className="truncate text-xs text-fg-muted">{g.description}</p>
                  </div>
                </div>
                <span className={cn('text-2xl font-semibold tabular-nums', g.total > 0 ? TONE_TEXT[g.tone as Tone] : 'text-fg-muted')}>
                  {formatInt(g.total)}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={r.href}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-sm px-1 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <span className={cn(r.count === 0 ? 'text-fg-muted' : 'text-fg')}>{r.label}</span>
                      <span className={cn('tabular-nums font-medium', r.count === 0 ? 'text-fg-muted' : TONE_TEXT[r.tone as Tone])}>
                        {formatInt(r.count)}
                        <span className="sr-only"> kayıt</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={g.href}
                className="mt-auto inline-flex min-h-[44px] items-center gap-1 pt-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Kuyruğa git <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">: {g.title}</span>
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}
