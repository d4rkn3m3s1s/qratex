'use client';

import { useEffect, useState, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Check, Loader2, Sparkles, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

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
  };
  limits: { maxQRCodes: number | null; maxBranches: number | null; planName: string };
  usage: { qrCodes: number };
  plans: Plan[];
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  trialing: 'Deneme',
  past_due: 'Ödeme gecikti',
  canceled: 'İptal edildi',
  incomplete: 'Tamamlanmadı',
};

export default function DealerBillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch('/api/dealer/billing')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => toast.error('Abonelik bilgileri yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    // Checkout dönüşünde durum bildirimi.
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'success') toast.success('Aboneliğiniz etkinleştiriliyor. Birkaç saniye içinde güncellenir.');
    else if (status === 'cancel') toast.error('Ödeme iptal edildi.');
  }, [fetchData]);

  const subscribe = (planId: string) => {
    setBusy(planId);
    fetch('/api/dealer/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.url) window.location.href = d.url;
        else throw new Error(d.error || 'Başlatılamadı');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Ödeme başlatılamadı'))
      .finally(() => setBusy(null));
  };

  const openPortal = () => {
    setBusy('portal');
    fetch('/api/dealer/billing/portal', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.url) window.location.href = d.url;
        else throw new Error(d.error || 'Portal açılamadı');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Portal açılamadı'))
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="Abonelik ve Faturalama"
        description="Planınızı yönetin, QR kotanızı yükseltin"
        icon={<CreditCard className="text-white" />}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Veri yüklenemedi.</p>
      ) : (
        <>
          {/* Mevcut durum */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Mevcut Planınız
              </CardTitle>
              <CardDescription>
                {data.limits.planName}
                {data.current.status && (
                  <Badge variant="secondary" className="ml-2">
                    {STATUS_LABEL[data.current.status] ?? data.current.status}
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">QR kotası: </span>
                  <strong>
                    {data.usage.qrCodes}
                    {data.limits.maxQRCodes != null ? ` / ${data.limits.maxQRCodes}` : ' / Sınırsız'}
                  </strong>
                </div>
                {data.current.currentPeriodEnd && (
                  <div>
                    <span className="text-muted-foreground">Yenileme: </span>
                    <strong>{new Date(data.current.currentPeriodEnd).toLocaleDateString('tr-TR')}</strong>
                  </div>
                )}
              </div>
              {data.current.hasCustomer && (
                <Button variant="outline" size="sm" onClick={openPortal} disabled={busy === 'portal'}>
                  {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Aboneliği yönet
                </Button>
              )}
            </CardContent>
          </Card>

          {!data.stripeEnabled && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              Self-servis ödeme şu an kapalı. Plan yükseltmesi için lütfen bizimle iletişime geçin.
            </div>
          )}

          {/* Planlar */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((plan) => {
              const isCurrent = plan.id === data.current.planId;
              return (
                <Card key={plan.id} className={plan.isPopular ? 'border-primary/40' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      {plan.isPopular && <Badge>Popüler</Badge>}
                    </div>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">
                        {plan.price.toLocaleString('tr-TR')} {plan.currency}
                      </span>
                      <span className="text-xs"> / {plan.interval === 'monthly' ? 'ay' : plan.interval === 'yearly' ? 'yıl' : 'tek seferlik'}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                        {plan.maxQRCodes != null ? `${plan.maxQRCodes} QR kodu` : 'Sınırsız QR kodu'}
                      </li>
                      {plan.features.slice(0, 5).map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <Button variant="secondary" className="w-full" disabled>
                        Mevcut planınız
                      </Button>
                    ) : plan.payable && data.stripeEnabled ? (
                      <Button className="w-full" onClick={() => subscribe(plan.id)} disabled={busy === plan.id}>
                        {busy === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Bu plana geç
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        İletişime geçin
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
