'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { toast } from 'sonner';
import { Radar, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { InlineError, SectionCard, SkeletonBlock, type Tone } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import type { RadarRuleStatus, RadarStatus } from '@/lib/dealer-queues/types';
import { errorMessage, fetchJson, queueKeys, sendJson } from '../shared/api';
import { useQueueLocale, useSharedCopy } from '../shared/copy';
import { formatNumber } from '../shared/format';
import { RelTime } from '../shared/ui';
import { useIncidentCopy } from './copy';

const LEVEL_TONE: Record<string, Tone> = { normal: 'success', watch: 'warning', alert: 'danger' };
const BAR: Record<string, string> = { normal: 'bg-success', watch: 'bg-warning', alert: 'bg-danger' };

function RuleRow({ rule }: { rule: RadarRuleStatus }) {
  const copy = useIncidentCopy();
  const locale = useQueueLocale();
  const label = copy.radar.rule[rule.key] ?? rule.key;
  const pct = Math.round(rule.ratio * 100);
  const notEnough = rule.key === 'rating_drop' && rule.value == null;
  let valueText: string;
  if (!rule.enabled) valueText = copy.radar.disabled;
  else if (notEnough) valueText = copy.radar.notEnough(Number(rule.detail.minSample ?? 2));
  else if (rule.key === 'rating_drop') valueText = copy.radar.ruleValue.rating_drop(formatNumber(rule.value ?? 0, locale, 1), formatNumber(rule.threshold, locale, 1));
  else valueText = copy.radar.ruleValue.count(rule.value ?? 0, rule.threshold);

  let detail = '';
  if (rule.key === 'rating_drop') {
    const fmt = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v, locale, 1));
    detail = copy.radar.ruleDetail.rating_drop(fmt(rule.detail.avgLast7), fmt(rule.detail.avgPrev7));
  } else if (rule.key === 'complaint_spike') detail = copy.radar.ruleDetail.complaint_spike(Number(rule.detail.windowHours ?? 24));
  else if (rule.key === 'urgent_toxic') detail = copy.radar.ruleDetail.urgent_toxic(Number(rule.detail.toxic ?? 0));
  else detail = copy.radar.ruleDetail.unanswered_negative(Number(rule.detail.slaHours ?? 24));

  return (
    <li className="min-w-0 space-y-1.5 rounded-control border border-subtle bg-surface-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="qx-small min-w-0 max-w-full truncate font-medium text-fg">{label}</span>
        <span className={cn('qx-caption qx-num min-w-0', rule.level === 'alert' ? 'text-danger' : rule.level === 'watch' ? 'text-warning' : 'text-fg-muted')}>
          {valueText}
        </span>
      </div>
      <div
        role="meter"
        aria-label={copy.radar.meterLabel(label, pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rule.enabled && !notEnough ? pct : 0}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-slow ease-standard', rule.enabled && !notEnough ? BAR[rule.level] : 'bg-fg-subtle')}
          style={{ width: `${rule.enabled && !notEnough ? Math.max(pct, 3) : 0}%` }}
        />
      </div>
      <p className="qx-caption truncate text-fg-subtle">{detail}</p>
    </li>
  );
}

export function RadarPanel({ initial, readOnly }: { initial: RadarStatus | null; readOnly: boolean }) {
  const copy = useIncidentCopy();
  const shared = useSharedCopy();
  const motion = useMotionPolicy();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const q = useQuery({
    queryKey: queueKeys.radar,
    queryFn: ({ signal }) => fetchJson<RadarStatus>('/api/dealer/queues/incidents/radar', { signal }),
    initialData: initial ?? undefined,
    staleTime: 60_000,
  });
  const status = q.data;

  const scan = async () => {
    setScanning(true);
    try {
      const res = await sendJson<{ created: Array<{ id: string }>; skipped: Array<{ type: string }>; status: RadarStatus }>(
        '/api/dealer/queues/incidents/radar',
        'POST',
        {}
      );
      qc.setQueryData(queueKeys.radar, res.status);
      const msg = res.created.length === 0 && res.skipped.length > 0 ? copy.radar.scanSkipped : copy.radar.scanDone(res.created.length);
      toast.success(msg);
      announce(msg);
      void qc.invalidateQueries({ queryKey: queueKeys.incidents });
    } catch (err) {
      toast.error(errorMessage(err, shared.failed));
    } finally {
      setScanning(false);
    }
  };

  const level = status?.level ?? 'normal';
  const tone = LEVEL_TONE[level];

  return (
    <SectionCard
      title={copy.radar.title}
      headingLevel="h3"
      icon={
        <span className="relative inline-grid place-items-center">
          {level === 'alert' && !motion.reduce ? (
            <m.span
              key={`pulse-${status?.evaluatedAt ?? ''}`}
              aria-hidden
              className="absolute inset-[-6px] rounded-full ring-2 ring-danger"
              initial={{ opacity: 0.8, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: DURATION.slow, ease: EASE.standard }}
            />
          ) : null}
          <Radar aria-hidden className={cn('h-5 w-5', level === 'alert' ? 'text-danger' : level === 'watch' ? 'text-warning' : 'text-success')} />
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
            <Link href="/dealer/automation/alerts">
              <SlidersHorizontal aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.thresholdsLink}
            </Link>
          </Button>
          {!readOnly ? (
            <Button variant="outline" size="sm" className="min-h-11 shadow-none sm:min-h-9" onClick={scan} loading={scanning} disabled={scanning}>
              <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />
              {scanning ? copy.radar.scanning : copy.radar.scan}
            </Button>
          ) : null}
        </div>
      }
    >
      {q.isError && !status ? (
        <InlineError variant="banner" onRetry={() => void q.refetch()}>
          {copy.radar.error}
        </InlineError>
      ) : !status ? (
        <SkeletonBlock className="h-28" />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="status" aria-live="polite">
            <StatusBadge tone={tone} label={copy.radar.level[level]} />
            <span className="qx-small text-fg-muted">{copy.radar.levelHint[level]}</span>
            <span className="qx-caption ml-auto text-fg-subtle">
              {status.lastScanAt ? (
                <>
                  {copy.radar.lastScan('')}
                  <RelTime iso={status.lastScanAt} />
                </>
              ) : (
                copy.radar.neverScanned
              )}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label={copy.radar.title}>
            {status.rules.map((r) => (
              <RuleRow key={r.key} rule={r} />
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
