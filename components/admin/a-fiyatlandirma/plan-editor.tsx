'use client';

import { useEffect, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Archive, Check, ChevronDown, History, Loader2, ShieldCheck, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  EntityEditorSheet,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
  TextareaField,
  useZodForm,
} from '@/components/ds/form';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, QueryState } from '@/components/states';
import {
  ACTION_LABEL,
  EMPTY_PLAN_FORM,
  FIELD_LABEL,
  INTERVAL_LABEL,
  INTERVAL_SUFFIX,
  PLAN_CURRENCIES,
  PLAN_INTERVALS,
  PlanFormSchema,
  STRIPE_PRICE_ID_RE,
  formToInput,
  formatMoney,
  planToForm,
  splitFeatures,
  type PlanFormValues,
  type PlanInput,
  type PlanSummary,
  type StripeCheck,
} from '@/lib/admin-pricing/contract';
import { cn } from '@/lib/utils';
import { archivePlan, createPlan, errorText, fetchHistory, previewArchive, pricingKeys, updatePlan, verifyStripe } from './api';
import { StripeCheckLine } from './stripe-check-line';
import { fmtAbs } from './format';

export type EditorState = { mode: 'create' } | { mode: 'edit'; plan: PlanSummary } | null;

type Props = {
  state: EditorState;
  onClose: () => void;
  onSaved: () => void;
  onReloadLatest: () => Promise<PlanSummary | null>;
  stripeConfigured: boolean;
};

/** Yalnız değişen alanları gönder (gereksiz Stripe doğrulaması ve denetim gürültüsü olmasın). */
export function changedFields(before: PlanInput, after: PlanInput): Partial<PlanInput> {
  const out: Partial<PlanInput> = {};
  for (const k of Object.keys(after) as Array<keyof PlanInput>) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      (out as Record<string, unknown>)[k] = after[k];
    }
  }
  return out;
}

/**
 * Plan düzenleyici — sağ çekmece (modal değil): solda form bölümleri, altta canlı bayi kartı
 * önizlemesi; kirliyken kapatma onayı, alan bazlı sunucu hataları, 409 sürüm çakışması bandı
 * (EntityEditorSheet). Tehlikeli eylem (arşiv) etki önizlemeli ve plan adı yazılarak onaylanır.
 */
export function PlanEditor({ state, onClose, onSaved, onReloadLatest, stripeConfigured }: Props) {
  const plan = state?.mode === 'edit' ? state.plan : null;
  const form = useZodForm(PlanFormSchema, { defaultValues: EMPTY_PLAN_FORM });
  const [version, setVersion] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<PlanInput | null>(null);

  useEffect(() => {
    if (!state) return;
    const values = state.mode === 'edit' ? planToForm(state.plan) : EMPTY_PLAN_FORM;
    form.reset(values);
    setVersion(state.mode === 'edit' ? state.plan.updatedAt : null);
    setBaseline(state.mode === 'edit' ? formToInput(values) : null);
  }, [state, form]);

  const submit = async (v: PlanFormValues) => {
    const input = formToInput(v);
    if (!plan) return createPlan(input);
    const diff = changedFields(baseline ?? input, input);
    return updatePlan(plan.id, { ...diff, expectedUpdatedAt: version ?? plan.updatedAt });
  };

  const reloadLatest = async () => {
    const latest = await onReloadLatest();
    if (latest) {
      const values = planToForm(latest);
      form.reset(values);
      setVersion(latest.updatedAt);
      setBaseline(formToInput(values));
    }
  };

  return (
    <EntityEditorSheet
      open={state !== null}
      onOpenChange={(o) => !o && onClose()}
      mode={plan ? 'edit' : 'create'}
      entityLabel="plan"
      title={plan ? `“${plan.name}” planını düzenle` : 'Yeni plan'}
      description={
        plan
          ? `${plan.subscribers.total} işletme bu planda. Fiyat değişikliği mevcut Stripe aboneliklerinin tutarını değiştirmez.`
          : 'Plan pasif (satışa kapalı) oluşturulur; hazır olunca “Satışta”yı açın.'
      }
      form={form}
      width="xl"
      onSubmit={submit}
      onSaved={onSaved}
      onReloadLatest={reloadLatest}
      footerStart={plan ? <ArchiveAction plan={plan} onDone={() => { onSaved(); onClose(); }} /> : null}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Temel bilgiler">
            <TextField control={form.control} name="name" label="Plan adı" required maxLength={120} />
            <TextareaField
              control={form.control}
              name="description"
              label="Kısa açıklama"
              optional
              emptyAsNull
              rows={2}
              maxLength={500}
              description="Bayi faturalama sayfasında ve vitrinde kartın altında görünür."
            />
          </Section>

          <Section title="Fiyat ve ödeme">
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField control={form.control} name="price" label="Fiyat" mode="decimal" precision={2} min={0} required />
              <SelectField
                control={form.control}
                name="currency"
                label="Para birimi"
                options={PLAN_CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
              <SelectField
                control={form.control}
                name="interval"
                label="Döngü"
                options={PLAN_INTERVALS.map((i) => ({ value: i, label: INTERVAL_LABEL[i] }))}
              />
            </div>
            <StripeField control={form.control} stripeConfigured={stripeConfigured} />
          </Section>

          <Section title="Limitler" hint="Limitler sunucuda uygulanır (QR oluşturma ve şube ekleme). Sınırsız, açık bir seçimdir; 0 gerçekten sıfırdır.">
            <LimitRow control={form.control} switchName="qrUnlimited" valueName="maxQRCodes" label="Maks QR kodu" unit="QR" />
            <LimitRow control={form.control} switchName="branchUnlimited" valueName="maxBranches" label="Maks şube" unit="şube" />
          </Section>

          <Section title="Özellikler">
            <TextareaField
              control={form.control}
              name="featuresText"
              label="Özellik satırları"
              required
              rows={6}
              autoResize
              description="Her satıra bir özellik (en fazla 80 satır, satır başına 200 karakter). Sıra, kartta görünen sıradır."
            />
          </Section>

          <Section title="Görünürlük">
            <SwitchField
              control={form.control}
              name="isActive"
              label="Satışta"
              variant="card"
              description="Kapalıyken plan vitrinde ve bayi satın alma listesinde görünmez. Mevcut aboneler planda ve limitlerinde KALIR."
            />
            <SwitchField
              control={form.control}
              name="isPopular"
              label="Öne çıkan plan"
              variant="card"
              description="Aynı anda yalnız bir plan öne çıkar; açarsanız diğerinin vurgusu kaldırılır."
            />
          </Section>

          {plan ? <HistorySection planId={plan.id} /> : null}
        </div>

        <aside aria-label="Canlı önizleme" className="lg:sticky lg:top-0 lg:self-start">
          <p className="qx-small mb-2 font-medium text-fg-muted">Bayinin göreceği kart</p>
          <PreviewCard control={form.control} />
        </aside>
      </div>
    </EntityEditorSheet>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4" aria-label={title}>
      <div>
        <h3 className="qx-h3 text-fg">{title}</h3>
        {hint ? <p className="qx-small mt-0.5 text-fg-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LimitRow({
  control,
  switchName,
  valueName,
  label,
  unit,
}: {
  control: Control<PlanFormValues>;
  switchName: 'qrUnlimited' | 'branchUnlimited';
  valueName: 'maxQRCodes' | 'maxBranches';
  label: string;
  unit: string;
}) {
  const unlimited = useWatch({ control, name: switchName });
  return (
    <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <NumberField control={control} name={valueName} label={label} mode="integer" min={0} unit={unit} disabled={unlimited} stepper />
      <div className="sm:pt-7">
        <SwitchField control={control} name={switchName} label="Sınırsız" />
      </div>
    </div>
  );
}

function StripeField({ control, stripeConfigured }: { control: Control<PlanFormValues>; stripeConfigured: boolean }) {
  const [priceId, price, currency, interval] = useWatch({ control, name: ['stripePriceId', 'price', 'currency', 'interval'] });
  const [check, setCheck] = useState<StripeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCheck(null);
    setErr(null);
  }, [priceId, price, currency, interval]);

  const trimmed = priceId?.trim() ?? '';
  const canVerify = stripeConfigured && STRIPE_PRICE_ID_RE.test(trimmed) && typeof price === 'number';

  const run = async () => {
    setChecking(true);
    setErr(null);
    try {
      const r = await verifyStripe({ stripePriceId: trimmed, price, currency, interval });
      setCheck(r.items[0] ?? null);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <TextField
        control={control}
        name="stripePriceId"
        label="Stripe fiyat kimliği"
        optional
        emptyAsNull
        placeholder="price_…"
        autoComplete="off"
        description={
          interval === 'lifetime'
            ? 'Tek seferlik planlar çevrim içi abonelikle satılmaz; boş bırakın.'
            : stripeConfigured
              ? 'Kaydederken Stripe’tan okunur; tutar, para birimi ve döngü plana uymazsa kayıt reddedilir. Eşleme yoksa bayi bu planı çevrim içi satın alamaz.'
              : 'Stripe anahtarı tanımlı değil: eşleme kaydedilir ama doğrulanamaz.'
        }
      />
      {stripeConfigured && interval !== 'lifetime' ? (
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={!canVerify || checking} onClick={run}>
            {checking ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            Stripe’ta doğrula
          </Button>
          <div aria-live="polite">
            {err ? <p className="qx-small text-danger">{err}</p> : null}
            {check ? <StripeCheckLine check={check} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewCard({ control }: { control: Control<PlanFormValues> }) {
  const v = useWatch({ control }) as Partial<PlanFormValues>;
  const features = splitFeatures(v.featuresText ?? '');
  const interval = v.interval ?? 'monthly';
  const price = typeof v.price === 'number' && Number.isFinite(v.price) ? v.price : 0;
  return (
    <div className={cn('rounded-card border bg-surface-1 p-4 shadow-sm', v.isPopular ? 'border-brand ring-1 ring-brand-border' : 'border-subtle')}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-fg">{v.name?.trim() || 'Plan adı'}</p>
        {v.isPopular ? <StatusBadge label="Öne çıkan" tone="brand" icon={Star} size="sm" /> : null}
      </div>
      {v.description ? <p className="qx-small mt-1 line-clamp-2 text-fg-muted">{v.description}</p> : null}
      <p className="mt-3 text-2xl font-bold tabular-nums text-fg">
        {price === 0 ? 'Ücretsiz' : formatMoney(price, v.currency ?? 'TRY')}
        {price > 0 ? <span className="qx-small ml-1 font-normal text-fg-muted">{INTERVAL_SUFFIX[interval]}</span> : null}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex gap-2 text-fg">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          {v.qrUnlimited ? 'Sınırsız QR kodu' : `${v.maxQRCodes ?? 0} QR kodu`}
        </li>
        <li className="flex gap-2 text-fg">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          {v.branchUnlimited ? 'Sınırsız şube' : `${v.maxBranches ?? 0} şube`}
        </li>
        {features.slice(0, 8).map((f, i) => (
          <li key={`${i}-${f}`} className="flex gap-2 text-fg">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 break-words">{f}</span>
          </li>
        ))}
        {features.length > 8 ? <li className="qx-small text-fg-muted">Vitrinde ilk 8 özellik gösterilir (+{features.length - 8}).</li> : null}
      </ul>
      {!v.isActive ? <p className="qx-small mt-3 rounded-chip bg-surface-muted px-2 py-1 text-fg-muted">Satışa kapalı — vitrinde görünmez</p> : null}
    </div>
  );
}

function HistorySection({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: pricingKeys.history(planId),
    queryFn: ({ signal }) => fetchHistory(planId, signal),
    enabled: open,
    staleTime: 30_000,
  });
  return (
    <section aria-label="Değişiklik geçmişi" className="rounded-card border border-subtle">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden /> Değişiklik geçmişi
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-subtle px-4 py-3">
          <QueryState query={q} skeleton="list" empty={{ title: 'Kayıt yok', description: 'Bu plan için denetim kaydı bulunmuyor.' }}>
            {(d) =>
              d.items.length === 0 ? (
                <p className="qx-small text-fg-muted">Bu plan için denetim kaydı bulunmuyor.</p>
              ) : (
                <ol className="space-y-3">
                  {d.items.map((h) => (
                    <li key={h.id} className="text-sm">
                      <p className="text-fg">
                        <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                        <span className="text-fg-muted">
                          {' '}· {h.by ?? 'Sistem'} · <time dateTime={h.at}>{fmtAbs(h.at)}</time>
                        </span>
                      </p>
                      {h.changes.length ? (
                        <ul className="qx-small mt-1 space-y-0.5 text-fg-muted">
                          {h.changes.map((c) => (
                            <li key={c.field}>
                              {FIELD_LABEL[c.field] ?? c.field}: <span className="line-through">{show(c.from)}</span> → <span className="text-fg">{show(c.to)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )
            }
          </QueryState>
        </div>
      ) : null}
    </section>
  );
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (Array.isArray(v)) return `${v.length} satır`;
  return String(v).slice(0, 80);
}

export function ArchiveAction({ plan, onDone, compact = false }: { plan: PlanSummary; onDone: () => void; compact?: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <Button type="button" variant={compact ? 'outline' : 'ghost'} className="min-h-11 text-danger sm:min-h-10" aria-label={`${plan.name} planını arşivle`}>
          <Archive className="h-4 w-4" aria-hidden />
          {compact ? null : 'Arşivle'}
        </Button>
      }
      tone="warning"
      title={`“${plan.name}” arşivlensin mi?`}
      description="Plan silinmez: yeni satışa kapanır ve vitrinden kalkar. Bu plandaki işletmeler planda ve limitlerinde kalır; Stripe abonelikleri etkilenmez. Arşivden geri alabilirsiniz."
      loadImpact={async () => {
        const r = await previewArchive(plan.id);
        return {
          items: [
            { label: 'Bu plandaki işletme', value: r.impact.subscribers, emphasis: r.impact.subscribers > 0 },
            { label: 'Aktif ücretli abonelik', value: r.impact.paying, emphasis: r.impact.paying > 0 },
          ],
          warning: r.impact.subscribers > 0 ? 'Aboneler etkilenmez; ancak bu plana yeni işletme atanamaz ve satın alınamaz.' : undefined,
        };
      }}
      confirmPhrase={plan.name}
      confirmLabel="Planı arşivle"
      irreversibleNote={false}
      onConfirm={async () => {
        await archivePlan(plan.id);
        onDone();
      }}
    />
  );
}
