'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CreditCard, ExternalLink, QrCode, Sparkles } from 'lucide-react';
import {
  ConfirmAction,
  PageHeader,
  QueryState,
  SectionCard,
  TONE_CALLOUT,
  TONE_CHIP,
  type ImpactPreview,
  type Tone,
} from '@/components/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/lib/admin-toast';
import { cn, formatCurrency } from '@/lib/utils';

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  isPopular: boolean;
  payable: boolean;
};

type BillingData = {
  stripeEnabled: boolean;
  current: {
    planId: string | null;
    status: string | null;
    currentPeriodEnd: string | null;
    hasCustomer: boolean;
    hasSubscription: boolean;
    canChangePlan: boolean;
  };
  limits: { maxQRCodes: number | null; maxBranches: number | null; planName: string };
  usage: { qrCodes: number; liveQrCodes: number };
  plans: Plan[];
};

type PlanChangePreview = {
  planId: string;
  planName: string;
  prorationAmount: number;
  nextPeriodAmount: number;
  currency: string;
  prorationDate: number;
  currentPeriodEnd: string | null;
};

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Aktif', tone: 'success' },
  trialing: { label: 'Deneme süresinde', tone: 'info' },
  past_due: { label: 'Ödeme alınamadı', tone: 'danger' },
  unpaid: { label: 'Ödenmedi', tone: 'danger' },
  paused: { label: 'Duraklatıldı', tone: 'warning' },
  incomplete: { label: 'Ödeme tamamlanmadı', tone: 'warning' },
  incomplete_expired: { label: 'Ödeme süresi doldu', tone: 'neutral' },
  canceled: { label: 'İptal edildi', tone: 'neutral' },
};

const INTERVAL_LABEL: Record<string, string> = { monthly: 'ay', yearly: 'yıl', lifetime: 'tek seferlik' };

class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

async function readJson(r: Response): Promise<Record<string, unknown>> {
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new HttpError(
      typeof d.error === 'string' ? d.error : 'İşlem tamamlanamadı',
      r.status,
      typeof d.code === 'string' ? d.code : undefined
    );
  }
  return d;
}

async function fetchBilling(): Promise<BillingData> {
  return (await readJson(await fetch('/api/dealer/billing', { cache: 'no-store' }))) as unknown as BillingData;
}

async function postJson(url: string, body?: unknown): Promise<Record<string, unknown>> {
  return readJson(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  );
}

/** Stripe tutarları en küçük para biriminde (kuruş) gelir. */
function formatMinor(amount: number, currency: string): string {
  return formatCurrency(amount / 100, currency.toUpperCase());
}

function formatPlanPrice(plan: Plan): string {
  try {
    return formatCurrency(plan.price, plan.currency || 'TRY');
  } catch {
    return `${plan.price.toLocaleString('tr-TR')} ${plan.currency}`;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const POLL_MS = 2000;
const POLL_MAX = 10;

export default function DealerBillingPage() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [awaitingActivation, setAwaitingActivation] = useState(false);
  const pollCount = useRef(0);

  const query = useQuery({
    queryKey: ['dealer-billing'],
    queryFn: fetchBilling,
    // Checkout dönüşünde webhook birkaç saniye gecikebilir → etkinleşene kadar kısa süre yokla.
    refetchInterval: (q) => {
      if (!awaitingActivation) return false;
      const status = (q.state.data as BillingData | undefined)?.current.status;
      if (status === 'active' || status === 'trialing' || pollCount.current >= POLL_MAX) return false;
      pollCount.current += 1;
      return POLL_MS;
    },
  });

  // Checkout dönüşü: bildirim bir kez gösterilir, adres temizlenir (yenilemede tekrar çıkmaz).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (!status) return;
    if (status === 'success') {
      toast.success('Ödemeniz alındı. Aboneliğiniz etkinleştiriliyor…');
      pollCount.current = 0;
      setAwaitingActivation(true);
    } else if (status === 'cancel') {
      toast.error('Ödeme iptal edildi. Kartınızdan çekim yapılmadı.');
    }
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const data = query.data;
  useEffect(() => {
    if (!awaitingActivation || !data) return;
    if (data.current.status === 'active' || data.current.status === 'trialing') {
      setAwaitingActivation(false);
      toast.success(`Aboneliğiniz etkin: ${data.limits.planName}`);
    } else if (pollCount.current >= POLL_MAX) {
      setAwaitingActivation(false);
    }
  }, [awaitingActivation, data]);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['dealer-billing'] }), [queryClient]);

  const subscribe = async (planId: string) => {
    setBusy(planId);
    try {
      const d = await postJson('/api/dealer/billing/checkout', { planId });
      if (typeof d.url === 'string') {
        window.location.href = d.url;
        return;
      }
      throw new Error('Ödeme sayfası açılamadı');
    } catch (e) {
      if (e instanceof HttpError && e.code === 'SUBSCRIPTION_EXISTS') {
        toast.error(e.message);
        void refresh();
      } else {
        toast.error(e instanceof Error ? e.message : 'Ödeme başlatılamadı');
      }
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    try {
      const d = await postJson('/api/dealer/billing/portal');
      if (typeof d.url === 'string') {
        window.location.href = d.url;
        return;
      }
      throw new Error('Yönetim portalı açılamadı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yönetim portalı açılamadı');
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow="Bayi paneli · Abonelik"
        title="Abonelik ve faturalama"
        description="Planınızı, kota kullanımınızı ve ödemelerinizi tek yerden yönetin."
        icon={<CreditCard />}
      />

      <QueryState
        query={query}
        skeleton="cards"
        loadingLabel="Abonelik bilgileri yükleniyor"
        error={{ title: 'Abonelik bilgileri yüklenemedi' }}
        isEmpty={() => false}
      >
        {(d) => (
          <BillingBody
            data={d}
            busy={busy}
            awaitingActivation={awaitingActivation}
            onSubscribe={subscribe}
            onPortal={openPortal}
            onChanged={refresh}
          />
        )}
      </QueryState>
    </div>
  );
}

function BillingBody({
  data,
  busy,
  awaitingActivation,
  onSubscribe,
  onPortal,
  onChanged,
}: {
  data: BillingData;
  busy: string | null;
  awaitingActivation: boolean;
  onSubscribe: (planId: string) => void;
  onPortal: () => void;
  onChanged: () => unknown;
}) {
  const { current, limits, usage } = data;
  const statusMeta = current.status ? STATUS_META[current.status] ?? { label: current.status, tone: 'neutral' as Tone } : null;
  const periodEnd = formatDate(current.currentPeriodEnd);
  const renews = current.status === 'active' || current.status === 'trialing';
  const paymentProblem = current.status === 'past_due' || current.status === 'unpaid';

  const limit = limits.maxQRCodes;
  const pct = limit ? Math.min(100, Math.round((usage.qrCodes / limit) * 100)) : 0;
  const usageTone: Tone = limit == null ? 'success' : pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'brand';

  return (
    <div className="space-y-6">
      {awaitingActivation && (
        <div role="status" className={cn('rounded-card border px-4 py-3 qx-small', TONE_CALLOUT.info)}>
          Ödemeniz doğrulanıyor; aboneliğiniz birkaç saniye içinde etkinleşecek.
        </div>
      )}

      {paymentProblem && (
        <div role="alert" className={cn('flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3', TONE_CALLOUT.danger)}>
          <p className="qx-small flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            Son ödemeniz alınamadı. Plan ayrıcalıklarınız ödeme yeniden denenirken korunuyor; kartınızı güncelleyin.
          </p>
          {current.hasCustomer && (
            <Button size="sm" onClick={onPortal} loading={busy === 'portal'} disabled={busy !== null}>
              Kartı güncelle
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard
          title="Mevcut planınız"
          icon={<Sparkles />}
          tone="brand"
          actions={
            current.hasCustomer ? (
              <Button variant="outline" size="sm" onClick={onPortal} loading={busy === 'portal'} disabled={busy !== null}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                Aboneliği yönet
              </Button>
            ) : null
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="qx-h2 text-fg">{limits.planName}</span>
              {statusMeta && (
                <span className={cn('rounded-full px-2.5 py-0.5 qx-small font-medium', TONE_CHIP[statusMeta.tone])}>
                  {statusMeta.label}
                </span>
              )}
            </div>
            {periodEnd && (
              <p className="qx-small text-fg-muted">
                {renews ? 'Sonraki yenileme' : paymentProblem ? 'Dönem sonu' : 'Sona erdi'}:{' '}
                <span className="font-medium text-fg">{periodEnd}</span>
              </p>
            )}
            {!current.hasSubscription && (
              <p className="qx-small text-fg-muted">
                Ücretli bir aboneliğiniz yok. Aşağıdaki planlardan birini seçerek kotanızı yükseltebilirsiniz.
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="QR kotası" icon={<QrCode />} tone={usageTone}>
          <div className="space-y-2">
            <p className="qx-num text-fg">
              <span className="qx-h2">{usage.qrCodes}</span>
              <span className="qx-small text-fg-muted"> / {limit != null ? limit : 'Sınırsız'}</span>
            </p>
            {limit != null && (
              <Progress
                value={pct}
                aria-label="QR kotası kullanımı"
                className="h-2 bg-surface-muted"
                indicatorClassName={cn(
                  'bg-none',
                  usageTone === 'danger' ? 'bg-danger' : usageTone === 'warning' ? 'bg-warning' : 'bg-brand'
                )}
              />
            )}
            <p className="qx-small text-fg-muted">
              {usage.liveQrCodes} etkin kod. İptal edilen ve arşivlenen kodlar da kotadan sayılır.
            </p>
            {limit != null && pct >= 100 && (
              <p className="qx-small font-medium text-danger">Kotanız doldu; yeni QR oluşturmak için planınızı yükseltin.</p>
            )}
          </div>
        </SectionCard>
      </div>

      {!data.stripeEnabled && (
        <div className={cn('flex items-start gap-2 rounded-card border px-4 py-3 qx-small', TONE_CALLOUT.warning)}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          Çevrim içi ödeme şu an kapalı. Plan değişikliği Qratex ekibi tarafından hesabınıza tanımlanabilir.
        </div>
      )}

      <section aria-labelledby="plans-heading" className="space-y-3">
        <h2 id="plans-heading" className="qx-h3 text-fg">
          Planlar
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((plan) => (
            <li key={plan.id} className="min-w-0">
              <PlanCard
                plan={plan}
                data={data}
                busy={busy}
                onSubscribe={onSubscribe}
                onChanged={onChanged}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PlanCard({
  plan,
  data,
  busy,
  onSubscribe,
  onChanged,
}: {
  plan: Plan;
  data: BillingData;
  busy: string | null;
  onSubscribe: (planId: string) => void;
  onChanged: () => unknown;
}) {
  const isCurrent = plan.id === data.current.planId;
  const prorationDate = useRef<number | undefined>(undefined);
  const canPay = plan.payable && data.stripeEnabled;
  const features = Array.from(new Set(plan.features));
  const shown = features.slice(0, 5);
  const hidden = features.length - shown.length;

  const loadImpact = async (): Promise<ImpactPreview> => {
    prorationDate.current = undefined;
    const d = await postJson('/api/dealer/billing/change-plan/preview', { planId: plan.id });
    const p = d.data as PlanChangePreview;
    prorationDate.current = p.prorationDate;
    const items: ImpactPreview['items'] = [
      p.prorationAmount >= 0
        ? { label: 'Şimdi tahsil edilecek (kalan gün farkı)', value: formatMinor(p.prorationAmount, p.currency), emphasis: true }
        : { label: 'Hesabınıza alacak (kalan gün farkı)', value: formatMinor(-p.prorationAmount, p.currency), emphasis: true },
      { label: 'Sonraki dönem tutarı', value: formatMinor(p.nextPeriodAmount, p.currency) },
      { label: 'Yeni QR limiti', value: plan.maxQRCodes != null ? `${plan.maxQRCodes} kod` : 'Sınırsız' },
    ];
    const over = plan.maxQRCodes != null && data.usage.qrCodes > plan.maxQRCodes;
    return {
      items,
      warning: over
        ? `Mevcut ${data.usage.qrCodes} QR kodunuz bu planın limitini (${plan.maxQRCodes}) aşıyor. Kodlarınız çalışmaya devam eder ama yeni kod oluşturamazsınız.`
        : undefined,
    };
  };

  const confirmChange = async () => {
    await postJson('/api/dealer/billing/change-plan', { planId: plan.id, prorationDate: prorationDate.current });
    toast.success(`Planınız "${plan.name}" olarak güncellendi.`);
    await onChanged();
  };

  let action: ReactNode;
  if (isCurrent) {
    action = (
      <Button variant="secondary" className="w-full" disabled>
        <Check className="h-4 w-4" aria-hidden />
        Mevcut planınız
      </Button>
    );
  } else if (!canPay) {
    action = (
      <p className="qx-small rounded-control border border-dashed px-3 py-2 text-center text-fg-muted">
        Bu plan çevrim içi satın alınamıyor; Qratex ekibi hesabınıza tanımlayabilir.
      </p>
    );
  } else if (data.current.hasSubscription) {
    action = data.current.canChangePlan ? (
      <ConfirmAction
        tone="brand"
        title={`"${plan.name}" planına geçilsin mi?`}
        description="Mevcut aboneliğiniz güncellenir; yeni bir abonelik açılmaz. Kalan günlerin farkı hemen hesaplanır."
        loadImpact={loadImpact}
        confirmLabel="Onayla ve geç"
        onConfirm={confirmChange}
        trigger={
          <Button className="w-full" disabled={busy !== null}>
            Planı değiştir
          </Button>
        }
      />
    ) : (
      <Button variant="outline" className="w-full" disabled>
        Önce bekleyen ödemeyi tamamlayın
      </Button>
    );
  } else {
    action = (
      <Button className="w-full" onClick={() => onSubscribe(plan.id)} loading={busy === plan.id} disabled={busy !== null}>
        <CreditCard className="h-4 w-4" aria-hidden />
        Abone ol
      </Button>
    );
  }

  return (
    <article
      className={cn(
        'flex h-full flex-col gap-4 rounded-card border bg-surface-1 p-card qx-elevation-1',
        plan.isPopular && !isCurrent && 'border-brand-border ring-1 ring-brand-border',
        isCurrent && 'border-success-border ring-1 ring-success-border'
      )}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="qx-h3 text-fg">{plan.name}</h3>
          {plan.isPopular && <span className={cn('rounded-full px-2 py-0.5 qx-small font-medium', TONE_CHIP.brand)}>Popüler</span>}
        </div>
        <p>
          <span className="qx-h2 qx-num text-fg">{formatPlanPrice(plan)}</span>
          <span className="qx-small text-fg-muted"> / {INTERVAL_LABEL[plan.interval] ?? plan.interval}</span>
        </p>
        {plan.description && <p className="qx-small text-fg-muted">{plan.description}</p>}
      </header>
      <ul className="flex-1 space-y-1.5 qx-small">
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          {plan.maxQRCodes != null ? `${plan.maxQRCodes} QR kodu` : 'Sınırsız QR kodu'}
        </li>
        {shown.map((f, i) => (
          <li key={`${i}-${f}`} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            {f}
          </li>
        ))}
        {hidden > 0 && <li className="pl-6 text-fg-muted">+{hidden} özellik daha</li>}
      </ul>
      {action}
    </article>
  );
}
