'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle2, Clock, Hourglass, Send, UserRound, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge, defineStatusMap, statusBadgeProps } from '@/components/ds/data';
import { EmptyState } from '@/components/states';
import type { PersonalOfferStatus, PersonalSection as PersonalSectionData, SectionState } from '@/lib/dealer/offers/types';
import { SectionBody } from './section-body';
import { useOffersCopy, useOffersLocale } from './context';
import { formatRelative } from './format';

const INBOX_REMEDY_HREF = '/dealer/inbox/remedy';

function Stat({ label, value, href, linkLabel }: { label: string; value: number; href?: string; linkLabel?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-subtle bg-surface-0 p-3">
      <p className="qx-caption text-fg-muted">{label}</p>
      <p className="qx-h3 tabular-nums text-fg">{value.toLocaleString('tr-TR')}</p>
      {href && value > 0 && (
        <Link
          href={href}
          className="qx-caption mt-1 inline-flex min-h-6 items-center gap-1 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
        >
          {linkLabel}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function PersonalOffersSection({
  state,
  now,
  onCreate,
  onRetry,
}: {
  state: SectionState<PersonalSectionData>;
  /** Göreli zaman için an (SSR ile hidrasyon aynı metni üretsin). */
  now: number;
  onCreate: () => void;
  onRetry: () => unknown;
}) {
  const copy = useOffersCopy();
  const locale = useOffersLocale();
  const statusMap = defineStatusMap<PersonalOfferStatus>({
    awaiting_dealer_approval: { label: copy.personalStatus.awaiting_dealer_approval, tone: 'warning', icon: Hourglass },
    pending: { label: copy.personalStatus.pending, tone: 'info', icon: Clock },
    accepted: { label: copy.personalStatus.accepted, tone: 'success', icon: CheckCircle2 },
    expired: { label: copy.personalStatus.expired, tone: 'neutral' },
    rejected: { label: copy.personalStatus.rejected, tone: 'neutral', icon: XCircle },
    other: { label: copy.personalStatus.other, tone: 'neutral' },
  });
  const ready = state.status === 'ready' ? state.data : null;

  return (
    <SectionCard
      id="kisiye-ozel"
      title={copy.personal.title}
      description={copy.personal.description}
      icon={<UserRound />}
      actions={
        ready ? (
          <Button type="button" size="sm" variant="outline" onClick={onCreate} className="min-h-11 gap-1.5">
            <Send className="h-4 w-4" aria-hidden />
            {copy.personal.send}
          </Button>
        ) : null
      }
    >
      <SectionBody state={state} disabledText={copy.personal.disabled} onRetry={onRetry}>
        {(data) => (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label={copy.personal.awaiting} value={data.awaitingApproval} href={INBOX_REMEDY_HREF} linkLabel={copy.personal.awaitingLink} />
              <Stat label={copy.personal.withCustomer} value={data.openWithCustomer} />
              <Stat label={copy.personal.accepted30} value={data.acceptedLast30} />
            </div>
            {data.items.length === 0 ? (
              <EmptyState
                variant="first-use"
                icon={UserRound}
                title={copy.personal.empty}
                description={copy.personal.emptyBody}
                compact
                headingLevel="p"
                action={
                  <Button type="button" onClick={onCreate} className="min-h-11 gap-1.5">
                    <Send className="h-4 w-4" aria-hidden />
                    {copy.personal.send}
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-subtle rounded-lg border border-subtle" aria-label={copy.personal.title}>
                {data.items.map((o) => (
                  <li key={o.id} className="flex flex-col gap-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="qx-small font-semibold text-fg">{o.customerName}</span>
                      <StatusBadge {...statusBadgeProps(statusMap, o.status)} size="sm" />
                      {o.selectionLabel && <span className="qx-caption font-semibold text-success">{o.selectionLabel}</span>}
                      <time dateTime={o.createdAt} className="qx-caption ml-auto text-fg-muted">
                        {formatRelative(o.createdAt, locale, now)}
                      </time>
                    </div>
                    <p className="qx-small line-clamp-2 text-fg-muted">{o.message}</p>
                    <p className="qx-caption inline-flex items-center gap-1 text-fg-muted">
                      {o.origin === 'churn' ? <Bot className="h-3.5 w-3.5" aria-hidden /> : <UserRound className="h-3.5 w-3.5" aria-hidden />}
                      {copy.personal.origin[o.origin]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SectionBody>
    </SectionCard>
  );
}
