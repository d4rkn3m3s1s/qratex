'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Edit, Loader2, PlusCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, TONE_CALLOUT } from '@/components/states';
import { INTERVAL_SUFFIX, formatMoney, type PlanSummary, type PricingOverview, type StripeCheck } from '@/lib/admin-pricing/contract';
import { cn } from '@/lib/utils';
import { createStripePrice, errorText, verifyStripe } from './api';
import { StripeCheckLine } from './stripe-check-line';

/**
 * Stripe fiyat eşlemesi: her satıştaki planın Stripe Price'ı ile tutar/para birimi/döngü uyumu.
 * Doğrulama yalnız istek üzerine (GET'te dış çağrı yok). "Stripe'ta oluştur" planın güncel
 * fiyatıyla yeni Price açar ve eşler; mevcut aboneler eski fiyatlarında kalır.
 */
export function StripeTab({
  plans,
  stripe,
  onChanged,
  onEdit,
}: {
  plans: PlanSummary[];
  stripe: PricingOverview['stripe'];
  onChanged: () => void;
  onEdit: (p: PlanSummary) => void;
}) {
  const [checks, setChecks] = useState<Record<string, StripeCheck>>({});
  const recurring = plans.filter((p) => p.interval !== 'lifetime');
  const verifiable = recurring.filter((p) => p.stripePriceId);

  const verifyAll = useMutation({
    mutationFn: () => verifyStripe({ planIds: verifiable.map((p) => p.id).slice(0, 50) }),
    onSuccess: (r) => {
      const map: Record<string, StripeCheck> = {};
      for (const c of r.items) if (c.planId) map[c.planId] = c;
      setChecks(map);
      const bad = r.items.filter((c) => c.status !== 'match').length;
      if (bad) toast.warning(`${bad} planın Stripe eşlemesinde sorun var.`);
      else toast.success('Tüm eşlemeler Stripe ile birebir uyumlu.');
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (recurring.length === 0) {
    return <EmptyState title="Yinelenen plan yok" description="Stripe eşlemesi yalnız aylık ve yıllık planlar için gerekir; tek seferlik planlar elle satılır." />;
  }

  return (
    <div className="space-y-4">
      <div className={cn('rounded-card border px-4 py-3 text-sm', TONE_CALLOUT[stripe.configured ? 'info' : 'warning'])}>
        {stripe.configured ? (
          <p>
            Stripe bağlı ({stripe.mode === 'live' ? 'canlı mod' : stripe.mode === 'test' ? 'test modu' : 'mod bilinmiyor'}). Fiyat kimliği kaydedilirken Stripe’tan okunur; tutar, para birimi ya da döngü plana uymazsa kayıt reddedilir. Bir planın fiyatını değiştirmek için önce yeni Stripe fiyatı oluşturun — mevcut aboneler eski fiyatta kalır.
          </p>
        ) : (
          <p>Stripe anahtarı tanımlı değil. Eşlemeler kaydedilebilir ama doğrulanamaz ve bayiler çevrim içi ödeme yapamaz.</p>
        )}
      </div>

      {stripe.configured && verifiable.length ? (
        <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => verifyAll.mutate()} disabled={verifyAll.isPending} aria-busy={verifyAll.isPending}>
          {verifyAll.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
          Eşlenmiş {verifiable.length} planı Stripe’ta doğrula
        </Button>
      ) : null}

      <ul className="divide-y divide-subtle rounded-card border border-subtle bg-surface-1" aria-live="polite">
        {recurring.map((p) => {
          const c = checks[p.id];
          const needsPrice = !p.stripePriceId || (c && c.status !== 'match');
          return (
            <li key={p.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-fg">
                  {p.name}{' '}
                  <span className="font-normal text-fg-muted">
                    · {p.price === 0 ? 'Ücretsiz' : `${formatMoney(p.price, p.currency)} ${INTERVAL_SUFFIX[p.interval]}`}
                    {!p.isActive ? ' · satışa kapalı' : ''}
                  </span>
                </p>
                {p.stripePriceId ? (
                  <p className="qx-small break-all font-mono text-fg-muted">{p.stripePriceId}</p>
                ) : (
                  <StatusBadge size="sm" label={p.price === 0 ? 'Ücretsiz — Stripe gerekmez' : 'Eşlenmemiş'} tone={p.price === 0 ? 'neutral' : 'warning'} srPrefix="Stripe:" />
                )}
                {c ? <StripeCheckLine check={c} /> : p.stripePriceId ? <p className="qx-small text-fg-muted">Henüz doğrulanmadı.</p> : null}
                {p.subscribers.paying ? <p className="qx-small text-fg-muted">{p.subscribers.paying} ödeyen abone bu planda.</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onEdit(p)}>
                  <Edit className="h-4 w-4" aria-hidden /> Kimliği düzenle
                </Button>
                {stripe.configured && p.price > 0 && needsPrice ? (
                  <ConfirmAction
                    trigger={
                      <Button className="min-h-11 sm:min-h-10">
                        <PlusCircle className="h-4 w-4" aria-hidden /> Stripe’ta oluştur ve eşle
                      </Button>
                    }
                    tone="brand"
                    title={`“${p.name}” için Stripe fiyatı oluşturulsun mu?`}
                    description={`Stripe’ta ${formatMoney(p.price, p.currency)} ${INTERVAL_SUFFIX[p.interval]} tutarında yeni bir fiyat açılır ve plana eşlenir. ${
                      p.stripePriceId ? 'Eski fiyattaki aboneler o fiyatta kalır; yeni satın almalar yeni fiyattan yapılır.' : ''
                    }`}
                    confirmLabel="Oluştur ve eşle"
                    irreversibleNote={false}
                    onConfirm={async () => {
                      const r = await createStripePrice(p.id, p.updatedAt);
                      setChecks((x) => ({ ...x, [p.id]: r.check }));
                      toast.success(`Stripe fiyatı oluşturuldu: ${r.plan.stripePriceId}`);
                      onChanged();
                    }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
