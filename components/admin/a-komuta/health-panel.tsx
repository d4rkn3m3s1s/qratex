'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/ds/data/status-badge';
import type { Tone } from '@/components/states';
import type { HealthStatus } from '@/lib/admin-command/types';
import type { HealthPayload } from './use-command';
import { formatClock } from './format';
import { useAdminKomutaCopy, useServerLabel } from './copy';

export const HEALTH_META: Record<HealthStatus, { label: string; tone: Tone }> = {
  ok: { label: 'Sağlıklı', tone: 'success' },
  warn: { label: 'Dikkat', tone: 'warning' },
  error: { label: 'Sorun', tone: 'danger' },
  unknown: { label: 'Bilinmiyor', tone: 'neutral' },
};

/** Platform sağlığı: gerçek yoklamalar (DB, Redis, cron, olay kuyruğu, AI, posta). */
export function HealthPanel({ data }: { data: HealthPayload }) {
  const t = useAdminKomutaCopy();
  const sl = useServerLabel();
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border" aria-label={t.healthChecks}>
        {data.checks.map((c) => {
          const meta = HEALTH_META[c.status];
          const label = sl.t('health', c.id, c.label);
          const detail = sl.t('detail', c.detail, c.detail);
          return (
            <li key={c.id}>
              <Link
                href={c.href}
                className="flex min-h-[48px] items-center gap-3 rounded-sm px-1 py-1.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{label}</p>
                  <p className="truncate text-xs text-fg-muted" title={detail}>
                    {detail}
                  </p>
                </div>
                <StatusBadge label={t.healthStatus[c.status]} tone={meta.tone} size="sm" srPrefix={t.statusOf(label)} />
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted">
        {t.probed}: {formatClock(data.generatedAt)}
        {data.environment.vercelEnv ? ` · ${t.env}: ${data.environment.vercelEnv}` : ''}
        {data.environment.region ? ` · ${t.region}: ${data.environment.region}` : ''}
      </p>
    </div>
  );
}
