'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ChevronRight, Clock, Gift, Ticket } from 'lucide-react';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RemedyOption } from '@/lib/remedy-options';
import type { CustomerRemedyStatus, VoiceBusiness } from '@/lib/customer-voices/types';
import { useVoicesCopy, useVoicesLocale } from './copy';
import { fetchJson, formatDate, shortRef, voicesKeys } from './lib';

export type RemedyPanelData = {
  id: string;
  status: CustomerRemedyStatus;
  message: string;
  offeredAt: string;
  acceptedAt: string | null;
  options: RemedyOption[];
  selectionLabel: string | null;
  selectionType: string | null;
  creditedPoints: number | null;
};

/** Seçenek değerinin okunur hâli (sunucunun etiket/birimiyle; "%20", "100 puan", "1 adet"). */
function valueLabel(opt: RemedyOption, v: number): string {
  const n = Number.isInteger(v) ? String(v) : v.toLocaleString('tr-TR');
  if (opt.type === 'discount' && opt.unit === '%') return `%${n}`;
  return `${n} ${opt.unit}`.trim();
}

function selectionText(opt: RemedyOption, v: number): string {
  if (opt.type === 'discount' && opt.unit === '%') return `%${v} ${opt.label}`;
  if (opt.type === 'points') return `${v} ${opt.unit || 'puan'}`;
  return `${v} ${opt.unit} ${opt.label}`.trim();
}

type AcceptResponse = { offer: { id: string; status: string; creditedPoints?: number | null; selection?: { type: string } } };

/**
 * Telafi teklifi: açıkken tür + miktar seçimi (yalnız sunucunun döndürdüğü seçenekler;
 * sunucu ayrıca allowlist ile doğrular — B5/P0-22), kabul edilmişse "telafin hazır"
 * kartı (puan türünde hesaba geçen gerçek miktar), süresi dolmuşsa açıklama.
 */
export function RemedyPanel({ remedy, business, onDone }: { remedy: RemedyPanelData; business: VoiceBusiness; onDone?: () => void }) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const qc = useQueryClient();
  const [type, setType] = useState<string | null>(remedy.options.length === 1 ? remedy.options[0].type : null);
  const [value, setValue] = useState<string | null>(null);
  const option = useMemo(() => remedy.options.find((o) => o.type === type) ?? null, [remedy.options, type]);

  const accept = useMutation({
    mutationFn: () =>
      fetchJson<AcceptResponse>(`/api/customer/remedy/${encodeURIComponent(remedy.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedType: type, selectedValue: value }),
      }),
    onSuccess: (res) => {
      const credited = res.offer?.creditedPoints;
      toast.success(credited != null && credited > 0 ? copy.remedyCredited(credited) : copy.remedyAcceptedToast);
      void qc.invalidateQueries({ queryKey: voicesKeys.all });
      onDone?.();
    },
  });

  if (remedy.status === 'accepted') {
    const isPoints = remedy.selectionType === 'points';
    // Kupon türü (indirim / ücretsiz ürün) Cüzdan → Kodlarım'da kasada gösterilir (m-cuzdan-oduller).
    const isCoupon = remedy.selectionType === 'discount' || remedy.selectionType === 'free_item';
    return (
      <div className="relative overflow-hidden rounded-card border border-brand-border bg-brand-subtle/50 p-card">
        {/* Bilet çentikleri (dekoratif) */}
        <span aria-hidden className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-surface-1" />
        <span aria-hidden className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-surface-1" />
        <p className="qx-caption flex items-center gap-1.5 font-medium text-brand">
          <CheckCircle2 aria-hidden className="h-4 w-4" />
          {copy.remedyAcceptedTitle}
        </p>
        <p className="qx-h2 mt-1 text-fg">{remedy.selectionLabel ?? copy.remedyAccepted}</p>
        <p className="qx-small mt-0.5 text-fg-muted">{business.name}</p>
        <p className="qx-small mt-3 text-fg">
          {isPoints && remedy.creditedPoints != null
            ? remedy.creditedPoints > 0
              ? copy.remedyCredited(remedy.creditedPoints)
              : copy.remedyNotCredited
            : copy.remedyDeliveredAtShop}
        </p>
        {isCoupon ? (
          <Link
            href={`/customer/wallet/owned?pass=${encodeURIComponent(`remedy:${remedy.id}`)}`}
            className="qx-small mt-2 inline-flex min-h-11 items-center gap-1 rounded-control font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copy.remedyOpenWallet}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
        <div className="qx-caption mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-dashed border-brand-border pt-2 text-fg-muted">
          {remedy.acceptedAt ? <span>{copy.remedyAcceptedAt(formatDate(remedy.acceptedAt, locale))}</span> : null}
          {!isPoints ? <span className="qx-num font-mono">{copy.remedyRef(shortRef(remedy.id))}</span> : null}
        </div>
      </div>
    );
  }

  if (remedy.status === 'expired') {
    return (
      <div className="rounded-card border border-subtle bg-surface-muted/60 p-card">
        <p className="qx-small flex items-center gap-2 font-medium text-fg-muted">
          <Clock aria-hidden className="h-4 w-4" />
          {copy.remedyExpired}
        </p>
        <p className="qx-small mt-1 text-fg-muted">{remedy.message}</p>
      </div>
    );
  }

  const valueNum = value != null ? Number(value) : null;
  const ready = !!option && valueNum != null && option.values.includes(valueNum);

  return (
    <div className="rounded-card border border-warning-border bg-warning-subtle/40 p-card">
      <p className="qx-small flex items-center gap-2 font-medium text-fg">
        <Gift aria-hidden className="h-4 w-4 text-warning" />
        {copy.remedyFrom(business.name)}
      </p>
      <blockquote className="qx-small mt-2 whitespace-pre-wrap break-words border-l-2 border-warning-border pl-3 text-fg">
        {remedy.message}
      </blockquote>

      {remedy.options.length > 0 ? (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !accept.isPending) accept.mutate();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="qx-small font-medium text-fg">{copy.remedyChooseType}</legend>
            <ChoiceChips
              aria-label={copy.remedyChooseType}
              options={remedy.options.map((o) => ({ value: o.type, label: o.label, icon: o.type === 'points' ? <Ticket className="h-4 w-4" aria-hidden /> : undefined }))}
              value={type}
              onChange={(v) => {
                setType(v);
                setValue(null);
              }}
              disabled={accept.isPending}
            />
          </fieldset>
          {option ? (
            <fieldset className="space-y-2">
              <legend className="qx-small font-medium text-fg">{copy.remedyChooseValue}</legend>
              <ChoiceChips
                aria-label={copy.remedyChooseValue}
                options={option.values.map((v) => ({ value: String(v), label: valueLabel(option, v) }))}
                value={value}
                onChange={setValue}
                disabled={accept.isPending}
              />
            </fieldset>
          ) : null}

          {accept.isError ? <InlineError variant="banner">{(accept.error as Error).message}</InlineError> : null}

          <div className={cn('space-y-2', !ready && 'opacity-90')}>
            {ready && option && valueNum != null ? (
              <p className="qx-small text-fg">{copy.remedyConfirm(selectionText(option, valueNum))}</p>
            ) : null}
            <p className="qx-caption text-fg-muted">{copy.remedyIrreversible}</p>
            <Button type="submit" className="w-full sm:w-auto" disabled={!ready} loading={accept.isPending}>
              {copy.remedyAccept}
            </Button>
          </div>
        </form>
      ) : (
        <p className="qx-small mt-3 text-fg-muted">{copy.remedyNoOptions}</p>
      )}
    </div>
  );
}
