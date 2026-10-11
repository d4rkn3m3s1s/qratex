'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, ExternalLink, FileText, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { BillingDetails, BillingPlan, BillingSummary } from '@/lib/dealer-settings/billing.server';
import {
  BILLING_DETAILS_KEY,
  BILLING_KEY,
  SettingsApiError,
  applyPlanChange,
  checkoutStatus,
  errorText,
  fetchBilling,
  fetchBillingDetails,
  openPortal,
  previewPlanChange,
  startCheckout,
} from './api';
import { INTERVAL_LABEL, INVOICE_STATUS, SUBSCRIPTION_STATUS, fmtDate, fmtMoneyMinor } from './format';
import { UsageMeter } from './ui';

/**
 * Abonelik — plan, durum, kota, planlar, plan değişikliği (önizleme + onay), Stripe portalı,
 * ödeme yöntemi ve faturalar. Para hareketi içeren her aksiyon önizleme/onaydan geçer.
 * Aktif abonelikte yeni Checkout AÇILMAZ (`subscriptions.update`, P0-29).
 */
export function BillingTab() {
  const summary = useQuery({ queryKey: BILLING_KEY, queryFn: () => fetchBilling() });
  return (
    <QueryState query={summary} skeleton="cards" error={{ title: 'Abonelik bilgileri yüklenemedi' }}>
      {(data: BillingSummary) => <BillingBody data={data} />}
    </QueryState>
  );
}

function BillingBody({ data }: { data: BillingSummary }) {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState<string | null>(null);
  const [changeTo, setChangeTo] = useState<BillingPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const highlight = params.get('plan');
  const highlightRef = useRef<HTMLLIElement>(null);

  const details = useQuery({
    queryKey: BILLING_DETAILS_KEY,
    queryFn: () => fetchBillingDetails(),
    enabled: data.stripeEnabled && data.current.hasCustomer,
    staleTime: 60_000,
  });

  const clearParams = (keys: string[]) => {
    const q = new URLSearchParams(params.toString());
    keys.forEach((k) => q.delete(k));
    const s = q.toString();
    router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
  };

  // Checkout dönüşü: oturumu doğrula, webhook'u beklemeden uzlaştır; en çok ~20 sn yokla (B9).
  const status = params.get('status');
  const sessionId = params.get('session_id');
  useEffect(() => {
    if (status === 'cancel') {
      toast.info('Ödeme iptal edildi; aboneliğinizde değişiklik yok.');
      clearParams(['status', 'session_id']);
      return;
    }
    if (status !== 'success' || !sessionId) return;
    let cancelled = false;
    setConfirming(true);
    (async () => {
      for (let i = 0; i < 10 && !cancelled; i++) {
        try {
          const r = await checkoutStatus(sessionId);
          if (r.state === 'active') {
            await queryClient.invalidateQueries({ queryKey: BILLING_KEY });
            await queryClient.invalidateQueries({ queryKey: BILLING_DETAILS_KEY });
            toast.success('Aboneliğiniz etkinleştirildi.');
            break;
          }
          if (r.state === 'expired' || r.state === 'not_found' || r.state === 'unpaid') {
            toast.error(r.state === 'unpaid' ? 'Ödeme tamamlanmadı.' : 'Ödeme oturumu doğrulanamadı.');
            break;
          }
        } catch {
          /* geçici hata: yeniden dene */
        }
        await new Promise((res) => setTimeout(res, 2000));
        if (i === 9) toast.info('Ödemeniz işleniyor. Birkaç dakika içinde planınız güncellenir.');
      }
      if (!cancelled) {
        setConfirming(false);
        clearParams(['status', 'session_id']);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId]);

  useEffect(() => {
    if (highlight && highlightRef.current) highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  const portal = async () => {
    setBusy('portal');
    try {
      const out = await openPortal();
      if (out.url) window.location.assign(out.url);
      else throw new Error('Portal açılamadı.');
    } catch (e) {
      toast.error(errorText(e, 'Abonelik yönetimi açılamadı.'));
      setBusy(null);
    }
  };

  const subscribe = async (plan: BillingPlan) => {
    setBusy(plan.id);
    try {
      const out = await startCheckout(plan.id);
      if (out.url) window.location.assign(out.url);
      else throw new Error('Ödeme sayfası açılamadı.');
    } catch (e) {
      if (e instanceof SettingsApiError && e.code === 'SUBSCRIPTION_EXISTS') {
        await queryClient.invalidateQueries({ queryKey: BILLING_KEY });
        toast.info('Zaten bir aboneliğiniz var; “Bu plana geç” ile planınızı değiştirebilirsiniz.');
      } else {
        toast.error(errorText(e, 'Ödeme başlatılamadı.'));
      }
      setBusy(null);
    }
  };

  const cur = data.current;
  const st = cur.status ? SUBSCRIPTION_STATUS[cur.status] ?? { label: cur.status, tone: 'neutral' as const } : null;
  const d = details.data;
  const periodLabel = d?.cancelAtPeriodEnd || cur.status === 'canceled' ? (cur.status === 'canceled' ? 'Sona erdi' : 'Sona erecek') : 'Yenileme';
  const anyBusy = busy !== null || confirming;

  return (
    <div className="space-y-6">
      <div aria-live="polite">
        {confirming && (
          <InlineError variant="banner" tone="info">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Ödemeniz doğrulanıyor…
            </span>
          </InlineError>
        )}
      </div>
      {cur.status === 'past_due' && (
        <InlineError variant="banner" tone="danger">
          <p className="font-medium text-fg">Son ödemeniz alınamadı.</p>
          <p className="mt-0.5 text-fg-muted">Planınız şimdilik sürüyor; kartınızı güncellemezseniz ücretsiz kademeye düşer.</p>
          {cur.hasCustomer && (
            <Button type="button" size="sm" className="mt-2" onClick={() => void portal()} disabled={anyBusy}>
              Kartı güncelle
            </Button>
          )}
        </InlineError>
      )}
      {d?.cancelAtPeriodEnd && cur.status !== 'canceled' && (
        <InlineError variant="banner" tone="warning">
          Aboneliğiniz {fmtDate(d.cancelAt ?? cur.currentPeriodEnd)} tarihinde sona erecek ve yenilenmeyecek. Devam etmek için “Aboneliği yönet”ten
          yeniden etkinleştirin.
        </InlineError>
      )}
      {!data.stripeEnabled && (
        <InlineError variant="banner" tone="info">
          Çevrimiçi ödeme şu an kapalı. Planlar bilgi amaçlı listeleniyor; mevcut aboneliğiniz etkilenmez.
        </InlineError>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard
          title="Mevcut plan"
          icon={<CreditCard className="h-5 w-5" aria-hidden />}
          actions={st ? <StatusBadge label={st.label} tone={st.tone} /> : <StatusBadge label="Ücretsiz kademe" tone="neutral" />}
        >
          <p className="qx-title font-semibold text-fg">{cur.planName}</p>
          {cur.currentPeriodEnd && (
            <p className="qx-small mt-1 text-fg-muted">
              {periodLabel}: {fmtDate(cur.currentPeriodEnd)}
            </p>
          )}
          {d?.trialEnd && cur.status === 'trialing' && <p className="qx-small text-fg-muted">Deneme bitişi: {fmtDate(d.trialEnd)}</p>}
          {cur.hasCustomer && data.stripeEnabled && (
            <div className="mt-4 space-y-2">
              <Button type="button" variant="outline" onClick={() => void portal()} disabled={anyBusy}>
                <Settings2 className="h-4 w-4" aria-hidden />
                {busy === 'portal' ? 'Açılıyor…' : 'Aboneliği yönet'}
              </Button>
              <p className="qx-caption text-fg-muted">Kart, fatura bilgileri ve iptal Stripe&apos;ın güvenli sayfasında yönetilir. İptal ederseniz dönem sonunda ücretsiz kademeye geçersiniz.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Kullanım" description="Planınızın sınırlarına göre.">
          <div className="space-y-5">
            <UsageMeter label="QR kodları" used={data.usage.qr.used} limit={data.usage.qr.limit} />
            <UsageMeter label="Şubeler" used={data.usage.branches.used} limit={data.usage.branches.limit} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Planlar" description={cur.hasSubscription ? 'Plan değişikliğinde fark tutarı önceden gösterilir.' : 'Bir plan seçerek Stripe ile güvenli ödeme yapın.'}>
        {data.plans.length === 0 ? (
          <EmptyState compact title="Şu an satışta plan yok" headingLevel="p" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.plans.map((plan) => {
              const isCurrent = cur.planId === plan.id;
              const isHighlight = highlight === plan.id && !isCurrent;
              return (
                <li
                  key={plan.id}
                  ref={isHighlight ? highlightRef : undefined}
                  className={cn(
                    'flex min-w-0 flex-col rounded-card border bg-surface-1 p-5',
                    isCurrent ? 'border-brand' : plan.isPopular || isHighlight ? 'border-brand-border' : 'border-subtle',
                    isHighlight && 'ring-2 ring-brand'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="qx-body font-semibold text-fg">{plan.name}</h3>
                    {isCurrent && <StatusBadge label="Şu anki planınız" tone="brand" size="sm" />}
                    {!isCurrent && plan.isPopular && <StatusBadge label="Popüler" tone="info" size="sm" />}
                  </div>
                  <p className="mt-2">
                    <span className="qx-title qx-num font-semibold text-fg">{fmtMoneyMinor(plan.priceMinor, plan.currency)}</span>{' '}
                    <span className="qx-small text-fg-muted">{INTERVAL_LABEL[plan.interval] ?? plan.interval}</span>
                  </p>
                  {plan.description && <p className="qx-small mt-2 text-fg-muted">{plan.description}</p>}
                  <ul className="qx-small mt-3 flex-1 space-y-1.5 text-fg">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      {plan.maxQRCodes == null ? 'Sınırsız QR kod' : `${plan.maxQRCodes} QR kod`}
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      {plan.maxBranches == null ? 'Sınırsız şube' : `${plan.maxBranches} şube`}
                    </li>
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <PlanAction
                      plan={plan}
                      data={data}
                      busy={busy}
                      disabled={anyBusy}
                      onSubscribe={() => void subscribe(plan)}
                      onChange={() => setChangeTo(plan)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {data.stripeEnabled && cur.hasCustomer && <DetailsSection query={details} />}

      {changeTo && (
        <ChangePlanDialog
          plan={changeTo}
          usage={data.usage}
          onClose={() => setChangeTo(null)}
          onDone={async () => {
            setChangeTo(null);
            await queryClient.invalidateQueries({ queryKey: BILLING_KEY });
            await queryClient.invalidateQueries({ queryKey: BILLING_DETAILS_KEY });
          }}
        />
      )}
    </div>
  );
}

function PlanAction({
  plan,
  data,
  busy,
  disabled,
  onSubscribe,
  onChange,
}: {
  plan: BillingPlan;
  data: BillingSummary;
  busy: string | null;
  disabled: boolean;
  onSubscribe: () => void;
  onChange: () => void;
}) {
  const cur = data.current;
  if (cur.planId === plan.id) return <p className="qx-small text-fg-muted">Bu plandasınız.</p>;
  if (!data.stripeEnabled || !plan.payable) {
    return <p className="qx-small text-fg-muted">Bu plan çevrimiçi satın alınamıyor.</p>;
  }
  if (cur.hasSubscription) {
    if (!cur.canChangePlan) {
      return <p className="qx-small text-fg-muted">Plan değiştirmek için önce bekleyen ödemenizi tamamlayın.</p>;
    }
    return (
      <Button type="button" variant="outline" className="w-full" onClick={onChange} disabled={disabled}>
        Bu plana geç
      </Button>
    );
  }
  return (
    <Button type="button" className="w-full" onClick={onSubscribe} disabled={disabled}>
      {busy === plan.id ? 'Ödeme sayfası açılıyor…' : 'Abone ol'}
    </Button>
  );
}

function ChangePlanDialog({
  plan,
  usage,
  onClose,
  onDone,
}: {
  plan: BillingPlan;
  usage: BillingSummary['usage'];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const preview = useQuery({ queryKey: ['dealer', 'billing', 'preview', plan.id], queryFn: () => previewPlanChange(plan.id), staleTime: 0, gcTime: 0, retry: false });
  const apply = useMutation({
    mutationFn: () => applyPlanChange(plan.id, preview.data!.prorationDate),
    onSuccess: async () => {
      toast.success(`Planınız ${plan.name} olarak değişti.`);
      await onDone();
    },
  });
  const overQr = plan.maxQRCodes != null && usage.qr.used > plan.maxQRCodes;
  const overBranches = plan.maxBranches != null && usage.branches.used > plan.maxBranches;
  const p = preview.data;

  return (
    <Dialog open onOpenChange={(o) => !o && !apply.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{plan.name} planına geç</DialogTitle>
          <DialogDescription>Değişiklik hemen uygulanır; fark tutarı mevcut kartınızdan tahsil edilir ya da hesabınıza alacak yazılır.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3" aria-live="polite">
          {preview.isLoading && (
            <p className="qx-small inline-flex items-center gap-2 text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Fark tutarı hesaplanıyor…
            </p>
          )}
          {preview.error && <InlineError variant="banner" onRetry={() => void preview.refetch()}>{errorText(preview.error, 'Önizleme alınamadı.')}</InlineError>}
          {p && (
            <dl className="divide-y divide-subtle rounded-control border border-subtle px-3">
              <div className="flex justify-between gap-3 py-2">
                <dt className="qx-small text-fg-muted">{p.prorationAmount >= 0 ? 'Şimdi tahsil edilecek' : 'Hesabınıza alacak'}</dt>
                <dd className="qx-small qx-num font-semibold text-fg">{fmtMoneyMinor(Math.abs(p.prorationAmount), p.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <dt className="qx-small text-fg-muted">Sonraki dönem</dt>
                <dd className="qx-small qx-num font-semibold text-fg">{fmtMoneyMinor(p.nextPeriodAmount, p.currency)}</dd>
              </div>
              {p.currentPeriodEnd && (
                <div className="flex justify-between gap-3 py-2">
                  <dt className="qx-small text-fg-muted">Sonraki yenileme</dt>
                  <dd className="qx-small font-semibold text-fg">{fmtDate(p.currentPeriodEnd)}</dd>
                </div>
              )}
            </dl>
          )}
          {(overQr || overBranches) && (
            <InlineError variant="banner" tone="warning">
              {overQr && <p>Şu an {usage.qr.used} QR kodunuz var; bu plan {plan.maxQRCodes} QR&apos;a izin verir. Mevcutlar çalışmaya devam eder, yenisi eklenemez.</p>}
              {overBranches && <p>Şu an {usage.branches.used} şubeniz var; bu plan {plan.maxBranches} şubeye izin verir.</p>}
            </InlineError>
          )}
          {apply.error && <InlineError variant="banner">{errorText(apply.error, 'Plan değiştirilemedi.')}</InlineError>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={apply.isPending}>
            Vazgeç
          </Button>
          <Button type="button" onClick={() => apply.mutate()} disabled={!p || apply.isPending}>
            {apply.isPending ? 'Uygulanıyor…' : 'Onayla ve geç'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsSection({ query }: { query: ReturnType<typeof useQuery<BillingDetails>> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <SectionCard title="Ödeme yöntemi">
        <QueryState query={query} skeleton="block" error={{ title: 'Ödeme bilgisi alınamadı' }}>
          {(d: BillingDetails) =>
            d.paymentMethod ? (
              <p className="qx-body text-fg">
                <span className="font-semibold capitalize">{d.paymentMethod.brand}</span> •••• {d.paymentMethod.last4}
                <span className="qx-small block text-fg-muted">
                  Son kullanma {String(d.paymentMethod.expMonth).padStart(2, '0')}/{d.paymentMethod.expYear}
                </span>
              </p>
            ) : (
              <p className="qx-small text-fg-muted">Kayıtlı kart yok.</p>
            )
          }
        </QueryState>
      </SectionCard>
      <SectionCard title="Faturalar" description="Son 12 fatura.">
        <QueryState
          query={query}
          skeleton="list"
          error={{ title: 'Faturalar alınamadı' }}
          isEmpty={(d: BillingDetails) => d.invoices.length === 0}
          empty={{ title: 'Henüz fatura yok', compact: true, icon: FileText }}
        >
          {(d: BillingDetails) => (
            <ul className="divide-y divide-subtle">
              {d.invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0">
                    <p className="qx-small font-medium text-fg">{fmtDate(inv.createdAt)}</p>
                    <p className="qx-caption text-fg-muted">
                      {inv.number ?? '—'} · {inv.status ? INVOICE_STATUS[inv.status] ?? inv.status : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="qx-small qx-num font-semibold text-fg">{fmtMoneyMinor(inv.amountMinor, inv.currency)}</span>
                    {(inv.hostedUrl || inv.pdfUrl) && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={(inv.pdfUrl ?? inv.hostedUrl) as string} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" aria-hidden />
                          {inv.pdfUrl ? 'PDF' : 'Görüntüle'}
                          <span className="sr-only"> ({fmtDate(inv.createdAt)} faturası)</span>
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </SectionCard>
    </div>
  );
}
