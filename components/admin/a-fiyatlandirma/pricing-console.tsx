'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CreditCard,
  Edit,
  Grid3X3,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, QueryState, TONE_CALLOUT } from '@/components/states';
import { fadeUp, staggerDelay, useReducedMotionPref } from '@/lib/motion';
import { INTERVAL_SUFFIX, formatMoney, type PlanSummary, type PricingOverview } from '@/lib/admin-pricing/contract';
import { cn } from '@/lib/utils';
import { errorText, fetchOverview, pricingKeys, reorderPlans, restorePlan } from './api';
import { ArchiveAction, PlanEditor, type EditorState } from './plan-editor';
import { FeatureMatrix } from './feature-matrix';
import { StripeTab } from './stripe-tab';
import { fmtAbs, fmtNum } from './format';
import { AdminFiyatlandirmaText } from './copy';

/**
 * Plan ve Abonelik konsolu (/admin/pricing). ops kaydı: sakin, yoğun; 3B yok.
 * Üç soruya ilk bakışta cevap: hangi planlar satışta, kim hangi planda, ödeme hattı sağlıklı mı?
 */
export function PricingConsole({ initial }: { initial: PricingOverview | null }) {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: pricingKeys.overview(),
    queryFn: ({ signal }) => fetchOverview(signal),
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });
  const [editor, setEditor] = useState<EditorState>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: pricingKeys.all });

  const live = useMemo(() => (overview.data?.plans ?? []).filter((p) => !p.archivedAt), [overview.data]);
  const archived = useMemo(() => (overview.data?.plans ?? []).filter((p) => p.archivedAt), [overview.data]);

  const reloadLatest = async () => {
    const r = await overview.refetch();
    const id = editor?.mode === 'edit' ? editor.plan.id : null;
    return r.data?.plans.find((p) => p.id === id) ?? null;
  };

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Gelir"
          title="Planlar ve fiyatlandırma"
          description="Bayilerin satın aldığı abonelik planları: fiyat, limitler, özellikler, Stripe eşlemesi ve vitrin sırası. Buradaki değişiklik bayi faturalama sayfasına ve herkese açık fiyat bölümüne yansır."
          icon={<CreditCard />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 sm:min-h-10" onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="h-4 w-4" aria-hidden /> Yeni plan
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => void refresh()} disabled={overview.isFetching}>
                <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'motion-safe:animate-spin')} aria-hidden /> Yenile
              </Button>
            </div>
          }
        />
      }
    >
      <QueryState query={overview} skeleton="stats" onRetry={() => overview.refetch()}>
        {(data) => <Kpis data={data} />}
      </QueryState>

      {overview.data ? (
        <SectionTabs
          ariaLabel="Fiyatlandırma bölümleri"
          defaultValue="planlar"
          tabs={[
            { value: 'planlar', label: 'Vitrin', icon: <Store />, count: live.length },
            { value: 'matris', label: 'Özellik matrisi', icon: <Grid3X3 /> },
            { value: 'stripe', label: 'Stripe eşlemesi', icon: <Wallet />, count: overview.data.kpis.unmappedSellable || undefined },
            { value: 'arsiv', label: 'Arşiv', icon: <Archive />, count: archived.length || undefined },
          ]}
        >
          {(t) => (
            <PanelErrorBoundary resetKeys={[t]}>
              {t === 'matris' ? (
                <FeatureMatrix plans={live} onChanged={() => void refresh()} />
              ) : t === 'stripe' ? (
                <StripeTab plans={live} stripe={overview.data!.stripe} onChanged={() => void refresh()} onEdit={(p) => setEditor({ mode: 'edit', plan: p })} />
              ) : t === 'arsiv' ? (
                <ArchiveTab plans={archived} onChanged={() => void refresh()} />
              ) : (
                <Storefront plans={live} onEdit={(p) => setEditor({ mode: 'edit', plan: p })} onCreate={() => setEditor({ mode: 'create' })} onChanged={() => void refresh()} />
              )}
            </PanelErrorBoundary>
          )}
        </SectionTabs>
      ) : null}

      <PlanEditor
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={() => void refresh()}
        onReloadLatest={reloadLatest}
        stripeConfigured={overview.data?.stripe.configured ?? false}
      />
    </PanelPage>
  );
}

function Kpis({ data }: { data: PricingOverview }) {
  const k = data.kpis;
  const mrr = k.mrrByCurrency;
  const primary = mrr.find((x) => x.currency === 'TRY') ?? mrr[0] ?? null;
  const others = mrr.filter((x) => x !== primary);
  const healthTone = !data.stripe.configured ? 'warning' : k.unmappedSellable > 0 ? 'warning' : 'success';
  return (
    <div className="space-y-4">
      <div role="status" className={cn('flex flex-col gap-1 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between', TONE_CALLOUT[healthTone])}>
        <p className="font-medium">
          {!data.stripe.configured
            ? 'Stripe yapılandırılmamış: bayiler planları çevrim içi satın alamaz; planlar yalnız elle atanabilir.'
            : k.unmappedSellable > 0
              ? `Satıştaki ${fmtNum(k.unmappedSellable)} yinelenen planın Stripe fiyatı eşlenmemiş — bayi bu planları çevrim içi satın alamaz.`
              : `Ödeme hattı hazır: satıştaki tüm yinelenen planlar Stripe’a eşlenmiş (${data.stripe.mode === 'live' ? 'canlı mod' : data.stripe.mode === 'test' ? 'test modu' : 'mod bilinmiyor'}).`}
        </p>
        <p className="qx-small text-fg-muted">
          Veri: <time dateTime={data.generatedAt}>{fmtAbs(data.generatedAt)}</time>
        </p>
      </div>
      <MetricGrid cols={4}>
        <MetricTile
          label="Ödeyen abone"
          icon={<Users />}
          metric={{ value: k.payingSubscribers }}
          hint={`Plana atanmış toplam ${fmtNum(k.assignedDealers)} işletme (elle atananlar dahil)`}
          animate
        />
        <MetricTile
          label="Tahmini MRR"
          icon={<Wallet />}
          tone="success"
          metric={{ value: primary?.amount ?? 0, format: 'currency', currency: primary?.currency ?? 'TRY' }}
          hint={
            (others.length ? others.map((o) => formatMoney(o.amount, o.currency)).join(' + ') + ' · ' : '') +
            'Ödeyen abone × liste fiyatı (yıllık ÷ 12). Eski fiyatta kalan Stripe abonelikleri farklı olabilir.'
          }
          animate
        />
        <MetricTile label="Satıştaki plan" icon={<Layers />} metric={{ value: k.sellablePlans }} hint={`Stripe’a eşlenmemiş: ${fmtNum(k.unmappedSellable)}`} tone={k.unmappedSellable ? 'warning' : 'neutral'} />
        <MetricTile label="Ücretsiz kademe" icon={<Store />} metric={{ value: k.freeTierDealers }} hint="Plan atanmamış bayiler (ücretsiz kademe limitleri uygulanır)" />
      </MetricGrid>
    </div>
  );
}

function Storefront({
  plans,
  onEdit,
  onCreate,
  onChanged,
}: {
  plans: PlanSummary[];
  onEdit: (p: PlanSummary) => void;
  onCreate: () => void;
  onChanged: () => void;
}) {
  const reduced = useReducedMotionPref();
  const [order, setOrder] = useState<string[] | null>(null);
  const ids = order ?? plans.map((p) => p.id);
  const byId = new Map(plans.map((p) => [p.id, p]));
  const list = ids.map((id) => byId.get(id)).filter((p): p is PlanSummary => !!p);
  const dirty = order !== null && order.join() !== plans.map((p) => p.id).join();

  const save = useMutation({
    mutationFn: () => reorderPlans(ids),
    onSuccess: () => {
      toast.success('Vitrin sırası kaydedildi.');
      setOrder(null);
      onChanged();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  if (plans.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="Henüz plan yok"
        description="İlk abonelik planını oluşturun. Plan pasif başlar; fiyatı, limitleri ve Stripe eşlemesini kontrol edip satışa açarsınız."
        action={
          <Button className="min-h-11" onClick={onCreate}>
            <Plus className="h-4 w-4" aria-hidden /> Yeni plan
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="qx-small text-fg-muted"><AdminFiyatlandirmaText k="orderHint" /></p>
        {dirty ? (
          <div className="flex gap-2" role="group" aria-label="Sıralama değişikliği">
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setOrder(null)} disabled={save.isPending}>
              Geri al
            </Button>
            <Button className="min-h-11 sm:min-h-9" onClick={() => save.mutate()} disabled={save.isPending} aria-busy={save.isPending}>
              Sırayı kaydet
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((plan, i) => (
          <Motion.li
            key={plan.id}
            layout={!reduced}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: staggerDelay(i) }}
            className="list-none"
          >
            <PlanCard plan={plan} index={i} total={list.length} onMove={move} onEdit={() => onEdit(plan)} onChanged={onChanged} />
          </Motion.li>
        ))}
      </ul>
    </div>
  );
}

function PlanCard({
  plan,
  index,
  total,
  onMove,
  onEdit,
  onChanged,
}: {
  plan: PlanSummary;
  index: number;
  total: number;
  onMove: (i: number, d: -1 | 1) => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const s = plan.subscribers;
  const stripeState =
    plan.interval === 'lifetime'
      ? { label: 'Elle satış', tone: 'neutral' as const }
      : plan.stripePriceId
        ? { label: 'Stripe eşli', tone: 'success' as const }
        : { label: 'Stripe yok', tone: 'warning' as const };
  return (
    <article
      aria-label={plan.name}
      className={cn('flex h-full flex-col gap-4 rounded-card border bg-surface-1 p-card', plan.isPopular ? 'border-brand ring-1 ring-brand-border' : 'border-subtle')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="qx-h3 truncate text-fg">{plan.name}</h3>
          <p className="qx-small mt-0.5 line-clamp-2 text-fg-muted">{plan.description || 'Açıklama yok'}</p>
        </div>
        <span className="qx-small shrink-0 tabular-nums text-fg-muted" aria-label={`Sıra ${index + 1}`}>
          #{index + 1}
        </span>
      </div>

      <p className="text-2xl font-bold tabular-nums text-fg">
        {plan.price === 0 ? 'Ücretsiz' : formatMoney(plan.price, plan.currency)}
        {plan.price > 0 ? <span className="qx-small ml-1 font-normal text-fg-muted">{INTERVAL_SUFFIX[plan.interval]}</span> : null}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <StatusBadge size="sm" label={plan.isActive ? 'Satışta' : 'Satışa kapalı'} tone={plan.isActive ? 'success' : 'neutral'} srPrefix="Durum:" />
        {plan.isPopular ? <StatusBadge size="sm" label="Öne çıkan" tone="brand" icon={Star} /> : null}
        <StatusBadge size="sm" label={stripeState.label} tone={stripeState.tone} srPrefix="Ödeme:" />
        <StatusBadge size="sm" label={plan.maxQRCodes == null ? 'QR sınırsız' : `${fmtNum(plan.maxQRCodes)} QR`} tone="neutral" icon={null} />
        <StatusBadge size="sm" label={plan.maxBranches == null ? 'Şube sınırsız' : `${fmtNum(plan.maxBranches)} şube`} tone="neutral" icon={null} />
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-card bg-surface-muted p-3 text-center">
        <div>
          <dt className="qx-small text-fg-muted"><AdminFiyatlandirmaText k="business" /></dt>
          <dd className="font-semibold tabular-nums text-fg">{fmtNum(s.total)}</dd>
        </div>
        <div>
          <dt className="qx-small text-fg-muted"><AdminFiyatlandirmaText k="payer" /></dt>
          <dd className="font-semibold tabular-nums text-fg">
            {fmtNum(s.paying)}
            {s.pastDue ? <span className="qx-small block font-normal text-warning">{fmtNum(s.pastDue)} gecikmede</span> : null}
          </dd>
        </div>
        <div>
          <dt className="qx-small text-fg-muted">MRR</dt>
          <dd className="font-semibold tabular-nums text-fg">{formatMoney(plan.mrr, plan.currency)}</dd>
        </div>
      </dl>

      <ul className="space-y-1 text-sm text-fg">
        {plan.features.slice(0, 4).map((f, i) => (
          <li key={`${i}-${f}`} className="line-clamp-1">
            • {f}
          </li>
        ))}
        {plan.features.length > 4 ? <li className="qx-small text-fg-muted">+{plan.features.length - 4} özellik daha</li> : null}
      </ul>

      <p className="qx-small mt-auto text-fg-muted">
        {plan.lastChange ? (
          <>
            Son değişiklik: {plan.lastChange.by ?? 'Sistem'} · <time dateTime={plan.lastChange.at}>{fmtAbs(plan.lastChange.at)}</time>
          </>
        ) : (
          <><AdminFiyatlandirmaText k="created" /> <time dateTime={plan.createdAt}>{fmtAbs(plan.createdAt)}</time></>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11 flex-1 sm:min-h-10" onClick={onEdit}>
          <Edit className="h-4 w-4" aria-hidden /> Düzenle
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 sm:h-10 sm:w-10"
          aria-label={`${plan.name} planını yukarı taşı`}
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 sm:h-10 sm:w-10"
          aria-label={`${plan.name} planını aşağı taşı`}
          disabled={index === total - 1}
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </Button>
        <ArchiveAction
          plan={plan}
          compact
          onDone={() => {
            toast.success(`“${plan.name}” arşivlendi.`);
            onChanged();
          }}
        />
      </div>
    </article>
  );
}

function ArchiveTab({ plans, onChanged }: { plans: PlanSummary[]; onChanged: () => void }) {
  if (plans.length === 0) {
    return <EmptyState title="Arşiv boş" description="Arşivlenen planlar burada durur; aboneleri planda kalır ve geri alınabilir." />;
  }
  return (
    <ul className="divide-y divide-subtle rounded-card border border-subtle bg-surface-1">
      {plans.map((p) => (
        <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-fg">{p.name}</p>
            <p className="qx-small text-fg-muted">
              {p.price === 0 ? 'Ücretsiz' : `${formatMoney(p.price, p.currency)} ${INTERVAL_SUFFIX[p.interval]}`} · {fmtNum(p.subscribers.total)} işletme hâlâ bu planda
              {p.subscribers.paying ? ` (${fmtNum(p.subscribers.paying)} ödeyen)` : ''} · arşiv: <time dateTime={p.archivedAt!}>{fmtAbs(p.archivedAt!)}</time>
            </p>
          </div>
          <ConfirmAction
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10">
                <RotateCcw className="h-4 w-4" aria-hidden /> Geri al
              </Button>
            }
            tone="brand"
            title={`“${p.name}” arşivden geri alınsın mı?`}
            description="Plan satışa KAPALI olarak döner ve vitrinin sonuna eklenir. Satışa açmak için düzenleyip “Satışta”yı açın."
            confirmLabel="Geri al"
            irreversibleNote={false}
            onConfirm={async () => {
              await restorePlan(p.id);
              toast.success(`“${p.name}” arşivden geri alındı.`);
              onChanged();
            }}
          />
        </li>
      ))}
    </ul>
  );
}
