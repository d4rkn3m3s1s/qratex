'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard, useUrlState } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import type { CustomerTag, MessageTemplate, SegmentCard, SegmentsOverview } from '@/lib/dealer-customers/types';
import { customerKeys, fetchSegments } from './api';
import { useCustomersCopy } from './copy';
import { useCustomersActions } from './context';
import { ActionHistory } from './action-history';
import { tagIcon, tagTone, useFormat } from './parts';

export function SegmentsTab() {
  const q = useQuery({ queryKey: customerKeys.segments(), queryFn: fetchSegments, staleTime: 60_000 });
  return (
    <QueryState query={q} skeleton="cards" isEmpty={() => false}>
      {(d) => <SegmentsView d={d} />}
    </QueryState>
  );
}

const ACTION_FOR: Record<CustomerTag, { type: 'message' | 'personal_offer'; template?: MessageTemplate }> = {
  at_risk: { type: 'personal_offer' },
  vip: { type: 'message', template: 'thanks' },
  loyal: { type: 'message', template: 'thanks' },
  dormant: { type: 'message', template: 'winback' },
  new: { type: 'message', template: 'welcome' },
};

function SegmentsView({ d }: { d: SegmentsOverview }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  return (
    <div className="space-y-6">
      <p className="qx-small text-fg-muted">{copy.segmentsDesc}</p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {d.segments.map((s) => (
          <li key={s.tag}>
            <SegmentCardView s={s} vipThreshold={s.tag === 'vip' && d.vipThreshold != null ? fmt.money(d.vipThreshold) : null} />
          </li>
        ))}
      </ul>
      {d.untagged > 0 && <p className="qx-small text-fg-muted">{copy.untagged(d.untagged)}</p>}
      <ActionHistory />
    </div>
  );
}

function SegmentCardView({ s, vipThreshold }: { s: SegmentCard; vipThreshold: string | null }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const url = useUrlState();
  const { compose, canSend } = useCustomersActions();
  const Icon = tagIcon(s.tag);
  const tone = tagTone(s.tag);
  const action = ACTION_FOR[s.tag];

  return (
    <SectionCard
      className="h-full"
      title={copy.tag[s.tag]}
      icon={<Icon />}
      tone={tone}
      headingLevel="h3"
      description={s.tag === 'vip' && vipThreshold ? copy.vipRule(vipThreshold) : copy.tagRule[s.tag]}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={s.count === 0}
            onClick={() => url.set({ tab: null, segment: s.tag, risk: null, band: null, q: null, page: null }, { history: 'push' })}
          >
            {copy.seeCustomers}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          {canSend && (
            <Button
              size="sm"
              className="min-h-11"
              disabled={s.count === 0}
              onClick={() =>
                compose({
                  audience: { kind: 'segment', tag: s.tag },
                  audienceLabel: `${copy.tabSegments}: ${copy.tag[s.tag]}`,
                  type: action.type,
                  template: action.template,
                })
              }
            >
              <Send className="h-4 w-4" aria-hidden />
              {copy.segAction[s.tag]}
            </Button>
          )}
        </div>
      }
    >
      <p className="qx-h2 qx-num text-fg">{fmt.number(s.count)}</p>
      <p className="qx-caption text-fg-muted">{copy.members(s.count, s.share)}</p>
      <div aria-hidden className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, s.share)}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <dt className="qx-caption text-fg-muted">{copy.segSpend}</dt>
          <dd className="qx-small qx-num font-semibold text-fg">{fmt.money(s.totalSpend)}</dd>
        </div>
        <div>
          <dt className="qx-caption text-fg-muted">{copy.segAvgSpend}</dt>
          <dd className="qx-small qx-num font-semibold text-fg">{fmt.money(s.avgSpend)}</dd>
        </div>
        <div>
          <dt className="qx-caption text-fg-muted">{copy.segRisk}</dt>
          <dd className="qx-small qx-num font-semibold text-fg">{fmt.percent(s.avgRisk)}</dd>
        </div>
      </dl>
      <p className="qx-caption mt-3 text-fg-muted">
        {s.lastAction ? copy.segLastAction(fmt.relative(s.lastAction.at), s.lastAction.sent) : copy.segNoAction}
      </p>
    </SectionCard>
  );
}
