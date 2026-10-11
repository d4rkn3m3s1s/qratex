'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { EmptyState, QueryState } from '@/components/states';
import type { RemedyOption } from '@/lib/remedy-options';
import { previewText, voiceKey } from '@/lib/customer-voices/core';
import type { CustomerRemedyListItem, CustomerRemedyStatus } from '@/lib/customer-voices/types';
import { useVoicesCopy } from './copy';
import { fetchJson, fetchRemedies, VoicesApiError, voicesKeys } from './lib';
import { RatingStars } from './rating-stars';
import { RemedyPanel } from './remedy-panel';

type SingleOffer = {
  offer: {
    id: string;
    status: string;
    message: string;
    createdAt: string;
    acceptedAt?: string | null;
    options?: RemedyOption[];
    selection?: { type: string } | null;
    selectionLabel?: string | null;
    dealer?: { id: string; name: string | null; businessName: string | null } | null;
    feedback?: { id: string; rating: number; text: string | null } | null;
    consumptionReview?: { consumptionId: string; rating: number; text: string | null } | null;
  };
};

/** Listede yoksa (50'den eski / doğrudan link) tekil uçtan oku ve aynı biçime getir. */
async function loadOffer(id: string, signal?: AbortSignal): Promise<CustomerRemedyListItem> {
  const list = await fetchRemedies(signal);
  const hit = list.offers.find((o) => o.id === id);
  if (hit) return hit;
  const one = await fetchJson<SingleOffer>(`/api/customer/remedy/${encodeURIComponent(id)}`, { signal });
  const o = one.offer;
  // Kaynak bağlamı (listedeki gibi): sunucu kaldırılmış kaynağı zaten null döner. Eskiden
  // burada hep `source: null` → yoruma bağlı eski teklif yanlışça "Sana özel teklif" görünüyordu.
  const src = o.feedback
    ? { key: voiceKey('qr', o.feedback.id), rating: o.feedback.rating, text: o.feedback.text }
    : o.consumptionReview
      ? { key: voiceKey('review', o.consumptionReview.consumptionId), rating: o.consumptionReview.rating, text: o.consumptionReview.text }
      : null;
  return {
    id: o.id,
    status: (o.status === 'accepted' || o.status === 'expired' ? o.status : 'pending') as CustomerRemedyStatus,
    message: o.message,
    offeredAt: o.createdAt,
    acceptedAt: o.acceptedAt ?? null,
    business: { id: o.dealer?.id ?? '', name: o.dealer?.businessName || o.dealer?.name || 'İşletme', logo: null },
    options: o.options ?? [],
    selectionLabel: o.selectionLabel ?? null,
    selectionType: o.selection?.type ?? null,
    creditedPoints: null,
    voiceKey: src?.key ?? null,
    source: src ? { rating: src.rating, textPreview: previewText(src.text, 120) } : null,
  };
}

/** `?offer=` çekmecesi: tek telafi teklifi (kaynak yorum bağlamıyla) + seçim/kabul. */
export function OfferDetailBody({ offerId, onOpenVoice }: { offerId: string; onOpenVoice: (key: string) => void }) {
  const copy = useVoicesCopy();
  const q = useQuery({
    queryKey: voicesKeys.offer(offerId),
    queryFn: ({ signal }) => loadOffer(offerId, signal),
    retry: (count, err) => !(err instanceof VoicesApiError && (err.status === 404 || err.status === 403)) && count < 2,
  });

  if (q.isError && q.error instanceof VoicesApiError && (q.error.status === 404 || q.error.status === 403)) {
    return <EmptyState variant="permission" icon={ShieldAlert} title={copy.remedyLoadError} description={q.error.message} compact />;
  }

  return (
    <QueryState query={q} skeleton="detail" loadingLabel={copy.loading} error={{ title: copy.remedyLoadError }}>
      {(o) => (
        <div className="space-y-4">
          {o.source ? (
            <div className="rounded-card border border-subtle bg-surface-muted/50 p-3">
              <p className="qx-caption text-fg-muted">{copy.remedyForVoice}</p>
              <RatingStars value={o.source.rating} className="mt-1" />
              {o.source.textPreview ? <p className="qx-small mt-1 line-clamp-3 text-fg">“{o.source.textPreview}”</p> : null}
              {o.voiceKey ? (
                <button
                  type="button"
                  onClick={() => onOpenVoice(o.voiceKey!)}
                  className="qx-small mt-2 inline-flex min-h-11 items-center gap-1 rounded-control font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copy.openVoiceLink}
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : (
            <p className="qx-caption text-fg-muted">{copy.remedyPersonal}</p>
          )}
          <RemedyPanel remedy={o} business={o.business} />
        </div>
      )}
    </QueryState>
  );
}
