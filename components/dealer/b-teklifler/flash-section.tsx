'use client';

import Link from 'next/link';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { BadgePercent, CheckCircle2, Clock, Gift, MapPin, MapPinOff, Plus, Store, Bookmark, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge, defineStatusMap, statusBadgeProps } from '@/components/ds/data';
import { ConfirmAction, EmptyState } from '@/components/states';
import { useMotionPolicy, listItem } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { flashStatus, flashValueLabel, type FlashStatus } from '@/lib/dealer/offers/rules';
import type { FlashOfferDto, FlashSection as FlashSectionData, SectionState } from '@/lib/dealer/offers/types';
import { SectionBody } from './section-body';
import { useOffersCopy, useOffersLocale } from './context';
import { formatDuration, formatWindow } from './format';

const SETTINGS_HREF = '/dealer/settings';

function useStatusMap() {
  const copy = useOffersCopy();
  return defineStatusMap<FlashStatus>({
    live: { label: copy.flashStatus.live, tone: 'success', icon: Zap },
    scheduled: { label: copy.flashStatus.scheduled, tone: 'info', icon: Clock },
    stopped: { label: copy.flashStatus.stopped, tone: 'neutral' },
    ended: { label: copy.flashStatus.ended, tone: 'neutral', icon: CheckCircle2 },
  });
}

/** Canlı teklifte kalan süre halkası (dekoratif; süre metinle de verilir). */
function ProgressRing({ fraction }: { fraction: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden focusable="false">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-surface-3" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - f)}
        className="stroke-success-border transition-[stroke-dashoffset] duration-base motion-reduce:transition-none"
      />
    </svg>
  );
}

/** Sunucu anlık görüntüsü bayatlarsa (canlı → bitti) durum istemcide yeniden türetilir. */
function derivedStatus(o: FlashOfferDto, now: number): FlashStatus {
  return o.status === 'stopped' ? 'stopped' : flashStatus({ isActive: true, validFrom: o.validFrom, validTo: o.validTo }, new Date(now));
}

function OfferIcon({ type }: { type: string }) {
  const Icon = type === 'COMPLIMENTARY' ? Gift : BadgePercent;
  return <Icon className="h-5 w-5" aria-hidden />;
}

function FlashRow({
  offer,
  now,
  index,
  onStop,
}: {
  offer: FlashOfferDto;
  now: number;
  index: number;
  onStop: (id: string) => Promise<unknown>;
}) {
  const copy = useOffersCopy();
  const locale = useOffersLocale();
  const policy = useMotionPolicy();
  const statusMap = useStatusMap();
  const status = derivedStatus(offer, now);
  const from = new Date(offer.validFrom).getTime();
  const to = new Date(offer.validTo).getTime();
  const open = status === 'live' || status === 'scheduled';
  const timing =
    status === 'live'
      ? copy.flash.endsIn(formatDuration(to - now, locale))
      : status === 'scheduled'
        ? copy.flash.startsIn(formatDuration(from - now, locale))
        : null;

  return (
    <Motion.li
      layout={!policy.reduce}
      variants={policy.variants(listItem)}
      initial="hidden"
      animate="visible"
      exit="exit"
      custom={index < 12 ? index : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-surface-1 p-3 sm:flex-row sm:items-center sm:p-4',
        status === 'live' ? 'border-success-border' : 'border-subtle',
        !open && 'bg-surface-0',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            open ? 'bg-brand-subtle text-brand' : 'bg-surface-3 text-fg-muted',
          )}
        >
          <OfferIcon type={offer.offerType} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="qx-body min-w-0 truncate font-semibold text-fg">{offer.title}</h4>
            <StatusBadge {...statusBadgeProps(statusMap, status)} size="sm" />
          </div>
          <p className="qx-small line-clamp-2 text-fg-muted">{offer.body}</p>
          <p className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
            <span className="font-semibold text-fg">{flashValueLabel(offer.offerType, offer.value, locale)}</span>
            <span className="tabular-nums">{formatWindow(offer.validFrom, offer.validTo, locale)}</span>
          </p>
        </div>
      </div>
      {open && (
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="flex items-center gap-2">
            {status === 'live' && <ProgressRing fraction={(to - now) / Math.max(1, to - from)} />}
            {timing && <span className="qx-small tabular-nums text-fg">{timing}</span>}
          </div>
          <ConfirmAction
            trigger={
              <Button type="button" variant="outline" size="sm" className="min-h-11 min-w-11">
                {copy.flash.stop}
              </Button>
            }
            title={copy.flash.stopTitle}
            description={copy.flash.stopBody}
            impact={[
              { label: copy.flashForm.titleLabel, value: offer.title },
              { label: copy.flashForm.typeLabel, value: flashValueLabel(offer.offerType, offer.value, locale) },
            ]}
            tone="warning"
            confirmLabel={copy.flash.stop}
            irreversibleNote={false}
            onConfirm={() => onStop(offer.id)}
          />
        </div>
      )}
    </Motion.li>
  );
}

function Visibility({ data }: { data: FlashSectionData }) {
  const copy = useOffersCopy();
  const rows: Array<{ ok: boolean; icon: typeof MapPin; text: string; fix?: { href: string; label: string } }> = [
    data.hasLocation
      ? { ok: true, icon: MapPin, text: copy.flash.locationOk }
      : { ok: false, icon: MapPinOff, text: copy.flash.locationMissing, fix: { href: SETTINGS_HREF, label: copy.flash.locationFix } },
    { ok: data.savedByCount > 0, icon: Bookmark, text: copy.flash.savedBy(data.savedByCount) },
    { ok: true, icon: Store, text: copy.flash.venuePage },
  ];
  if (!data.hasBusinessName) {
    rows.unshift({ ok: false, icon: Store, text: copy.flash.nameMissing, fix: { href: SETTINGS_HREF, label: copy.flash.nameFix } });
  }
  return (
    <div className="rounded-lg border border-subtle bg-surface-0 p-3">
      <p className="qx-caption mb-2 font-semibold uppercase tracking-wide text-fg-muted">{copy.flash.visibility}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.text} className="qx-small flex items-start gap-2">
            <r.icon className={cn('mt-0.5 h-4 w-4 shrink-0', r.ok ? 'text-success' : 'text-warning')} aria-hidden />
            <span className="min-w-0 flex-1 text-fg">
              <span className="sr-only">{r.ok ? '✓ ' : '! '}</span>
              {r.text}
            </span>
            {r.fix && (
              <Link href={r.fix.href} className="qx-small shrink-0 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm">
                {r.fix.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlashOffersSection({
  state,
  now,
  onCreate,
  onStop,
  onRetry,
}: {
  state: SectionState<FlashSectionData>;
  now: number;
  onCreate: () => void;
  onStop: (id: string) => Promise<unknown>;
  onRetry: () => unknown;
}) {
  const copy = useOffersCopy();
  const ready = state.status === 'ready' ? state.data : null;
  const limitReached = !!ready && ready.openCount >= ready.maxOpen;
  return (
    <SectionCard
      id="kisa-sureli"
      title={copy.flash.title}
      description={copy.flash.description}
      icon={<Zap />}
      actions={
        ready ? (
          <Button type="button" size="sm" onClick={onCreate} disabled={limitReached || !ready.hasBusinessName} className="min-h-11 gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            {copy.newFlash}
          </Button>
        ) : null
      }
    >
      <SectionBody state={state} disabledText={copy.flash.disabled} onRetry={onRetry}>
        {(data) => {
          const isOpen = (o: FlashOfferDto) => {
            const st = derivedStatus(o, now);
            return st === 'live' || st === 'scheduled';
          };
          const open = data.items.filter(isOpen);
          const past = data.items.filter((o) => !isOpen(o));
          return (
            <div className="space-y-4">
              <Visibility data={data} />
              {limitReached && (
                <p role="status" className="qx-small rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
                  {copy.flash.limitReached(data.maxOpen)}
                </p>
              )}
              {data.items.length === 0 ? (
                <EmptyState
                  variant="first-use"
                  icon={Zap}
                  title={copy.flash.empty}
                  description={copy.flash.emptyBody}
                  compact
                  headingLevel="p"
                  action={
                    data.hasBusinessName ? (
                      <Button type="button" onClick={onCreate} className="min-h-11 gap-1.5">
                        <Plus className="h-4 w-4" aria-hidden />
                        {copy.newFlash}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {open.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="qx-small font-semibold text-fg">{copy.flash.open}</h3>
                      <ul className="space-y-2" aria-label={copy.flash.open}>
                        <AnimatePresence initial={false}>
                          {open.map((o, i) => (
                            <FlashRow key={o.id} offer={o} now={now} index={i} onStop={onStop} />
                          ))}
                        </AnimatePresence>
                      </ul>
                    </div>
                  )}
                  {past.length > 0 && (
                    <details className="group rounded-lg border border-subtle" open={open.length === 0}>
                      <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center justify-between px-3 font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-lg">
                        <span>
                          {copy.flash.history} <span className="font-normal text-fg-muted tabular-nums">({past.length})</span>
                        </span>
                        <span aria-hidden className="text-fg-muted transition-transform duration-fast group-open:rotate-180">
                          ▾
                        </span>
                      </summary>
                      <ul className="space-y-2 p-3 pt-0" aria-label={copy.flash.history}>
                        {past.map((o, i) => (
                          <FlashRow key={o.id} offer={o} now={now} index={i} onStop={onStop} />
                        ))}
                      </ul>
                      {data.hasMore && <p className="qx-caption px-3 pb-3 text-fg-muted">{copy.flash.olderHidden}</p>}
                    </details>
                  )}
                </>
              )}
            </div>
          );
        }}
      </SectionBody>
    </SectionCard>
  );
}
