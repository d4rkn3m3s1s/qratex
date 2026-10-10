'use client';

import { Archive, CalendarClock, CheckCircle2, FileText, AlertTriangle, Users } from 'lucide-react';
import { StatusBadge } from '@/components/ds/data';
import type { Tone } from '@/components/states';
import { normalizeStatus, type CampaignSegmentKey, type CampaignStatus } from '../domain';
import { useCampaignCopy } from '../client/use-copy';

const STATUS_META: Record<CampaignStatus, { tone: Tone; icon: typeof FileText }> = {
  draft: { tone: 'neutral', icon: FileText },
  scheduled: { tone: 'info', icon: CalendarClock },
  sent: { tone: 'success', icon: CheckCircle2 },
  failed: { tone: 'danger', icon: AlertTriangle },
  archived: { tone: 'neutral', icon: Archive },
};

export function CampaignStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const { c } = useCampaignCopy();
  const s = normalizeStatus(status);
  const meta = STATUS_META[s];
  return <StatusBadge label={c.status[s]} tone={meta.tone} icon={meta.icon} size={size} />;
}

/** Kitle çipi — renk değil metin taşır (ikon + ad); bilinmeyen kitle uyarı tonunda. */
export function SegmentChip({ segment, size = 'sm' }: { segment: CampaignSegmentKey | null; size?: 'sm' | 'md' }) {
  const { c } = useCampaignCopy();
  if (!segment) return <StatusBadge label={c.unknownSegment} tone="warning" size={size} />;
  return <StatusBadge label={c.segments[segment].label} tone={segment === 'risk' ? 'warning' : 'brand'} icon={Users} size={size} />;
}
