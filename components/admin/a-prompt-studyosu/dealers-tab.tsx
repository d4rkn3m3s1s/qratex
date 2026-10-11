'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DataTable, DetailSheet, KeyValueList, StatusBadge, useDetailSheet, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, type FilterField } from '@/components/ds/page';
import { ConfirmAction, EmptyState, InlineError, QueryState } from '@/components/states';
import {
  DEALER_AI_CONTEXT_MAX,
  buildDealerQs,
  POLICY_FIELD_LABELS,
  type DealerDetail,
  type DealerListPage,
  type DealerPolicyView,
  type DealerRow,
} from '@/lib/ai-studio/contract';
import { cn } from '@/lib/utils';
import { errorText, fetchDealer, fetchDealers, fieldErrors, isConflict, refreshDealerProfile, studioKeys, updateDealerPolicy } from './api';
import { fmtAgo, fmtDateTime, fmtNumber } from './format';
import { CountedTextarea, ReasonInput, reasonOk } from './parts';

export type DealersInitial = { qs: string; page: DealerListPage } | null;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const FILTER_OPTIONS = [
  { value: 'ai_off', label: 'AI kapalı' },
  { value: 'auto_off', label: 'Otomatik analiz kapalı' },
  { value: 'custom_prompt', label: 'İşletme bağlamı olan' },
  { value: 'with_profile', label: 'Öğrenme profili olan' },
  { value: 'no_profile', label: 'Öğrenme profili olmayan' },
];

/**
 * Bayiler: AI politikası (yalnız gerçekten tüketilen anahtarlar) + adaptif öğrenme profili.
 * Liste sunucu sayfalı ve aranır; ayar satırı olmayan bayi "varsayılan" olarak görünür.
 */
export default function DealersTab({ initial }: { initial?: DealersInitial }) {
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: 'Ara', placeholder: 'İşletme adı ya da e-posta', minLength: 2 },
      { type: 'select', key: 'durum', label: 'Durum', allLabel: 'Tümü', options: FILTER_OPTIONS },
    ],
    []
  );
  const filters = useFilterState(fields);
  const table = useUrlTableState({ defaultPageSize: 20 });
  const sheet = useDetailSheet('bayi');
  const qs = buildDealerQs({ q: str(filters.values.q), filter: str(filters.values.durum), page: table.params.page, size: table.params.pageSize });
  const list = useQuery({
    queryKey: studioKeys.dealers(qs),
    queryFn: ({ signal }) => fetchDealers(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<DealerRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Bayi',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Bayi' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-[12rem]">
            <span className="block truncate font-medium text-fg">{row.original.name}</span>
            {row.original.email ? <span className="block truncate text-xs text-fg-muted">{row.original.email}</span> : null}
          </div>
        ),
      },
      {
        id: 'policy',
        header: 'AI politikası',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'AI politikası' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const p = row.original.policy;
          return (
            <div className="flex flex-wrap gap-1">
              <StatusBadge size="sm" label={p.isEnabled ? 'AI açık' : 'AI kapalı'} tone={p.isEnabled ? 'success' : 'danger'} />
              {p.isEnabled && !p.autoAnalyze ? <StatusBadge size="sm" label="Otomatik analiz kapalı" tone="warning" /> : null}
              {p.hasCustomPrompt ? <StatusBadge size="sm" label="Bağlam var" tone="info" /> : null}
              {p.isDefault ? <StatusBadge size="sm" label="Varsayılan" tone="neutral" icon={null} /> : null}
            </div>
          );
        },
      },
      {
        id: 'profile',
        header: 'Öğrenme profili',
        enableSorting: false,
        meta: { label: 'Öğrenme profili' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const pr = row.original.profile;
          return pr ? (
            <span className="text-sm">
              Sürüm {pr.version} · <time dateTime={pr.lastTrainedAt ?? undefined}>{fmtAgo(pr.lastTrainedAt)}</time>
            </span>
          ) : (
            <span className="text-sm text-fg-muted">Yok</span>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <FilterBar fields={fields} ariaLabel="Bayi filtreleri" />
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(list.data.total)} bayi bulundu` : ''}
      </p>
      <DataTable
        ariaLabel="Bayi AI politikaları"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        manualPagination
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        activeRowId={sheet.id}
        onRowClick={(r) => sheet.open(r.id)}
        empty={
          filters.activeCount > 0
            ? { variant: 'filtered', title: 'Filtrelere uyan bayi yok', secondaryAction: <Button variant="outline" className="min-h-11" onClick={filters.clear}>Filtreleri temizle</Button> }
            : { variant: 'first-use', title: 'Henüz bayi yok', description: 'İlk bayi kaydolduğunda AI politikası burada yönetilir.' }
        }
      />
      <DetailSheet paramKey="bayi" title="Bayi AI ayarları" size="lg">
        {(id) => <DealerDetailBody id={id} />}
      </DetailSheet>
    </div>
  );
}

function DealerDetailBody({ id }: { id: string }) {
  const q = useQuery({ queryKey: studioKeys.dealer(id), queryFn: () => fetchDealer(id), staleTime: 10_000 });
  return (
    <QueryState query={q} skeleton="detail" error={{ title: 'Bayi yüklenemedi' }}>
      {(d) => <DealerDetailView d={d} />}
    </QueryState>
  );
}

type BoolField = 'isEnabled' | 'autoAnalyze' | 'alertOnToxic' | 'alertOnUrgent' | 'alertOnChurnRisk' | 'weeklyReportEnabled';

const SWITCHES: Array<{ key: BoolField; hint: string; dependsOnAi?: boolean }> = [
  { key: 'isEnabled', hint: 'Kapalıysa bu bayi adına hiçbir LLM çağrısı yapılmaz (analiz, sohbet, içgörü, otomatik yanıt, öğrenme).' },
  { key: 'autoAnalyze', hint: 'Yeni geri bildirimlerin arka planda (anlık + ai-retry cron) analiz edilmesi.', dependsOnAi: true },
  { key: 'alertOnToxic', hint: 'Toksik içerikli geri bildirimde bayiye bildirim.', dependsOnAi: true },
  { key: 'alertOnUrgent', hint: 'Aciliyet 0,7 üzerindeyse bildirim.', dependsOnAi: true },
  { key: 'alertOnChurnRisk', hint: 'Kayıp riski 0,7 üzerindeyse bildirim.', dependsOnAi: true },
  { key: 'weeklyReportEnabled', hint: 'Haftalık özet e-postası (AI ana anahtarından bağımsız).' },
];

function pickPolicy(p: DealerPolicyView) {
  return {
    isEnabled: p.isEnabled,
    autoAnalyze: p.autoAnalyze,
    alertOnToxic: p.alertOnToxic,
    alertOnUrgent: p.alertOnUrgent,
    alertOnChurnRisk: p.alertOnChurnRisk,
    weeklyReportEnabled: p.weeklyReportEnabled,
    customPrompt: p.customPrompt ?? '',
  };
}

function DealerDetailView({ d }: { d: DealerDetail }) {
  const qc = useQueryClient();
  const baseId = useId();
  const [form, setForm] = useState(() => pickPolicy(d.policy));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    setForm(pickPolicy(d.policy));
  }, [d.policy]);

  const original = pickPolicy(d.policy);
  const changedKeys = (Object.keys(form) as Array<keyof typeof form>).filter((k) =>
    k === 'customPrompt' ? form.customPrompt.trim() !== original.customPrompt.trim() : form[k] !== original[k]
  );
  const dirty = changedKeys.length > 0;

  const setDetail = (next: DealerDetail) => {
    qc.setQueryData(studioKeys.dealer(d.id), next);
    qc.invalidateQueries({ queryKey: ['ai-studio', 'dealers'] });
    qc.invalidateQueries({ queryKey: studioKeys.overview() });
  };

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { reason, baseVersion: d.policy.version };
      for (const k of changedKeys) body[k] = k === 'customPrompt' ? (form.customPrompt.trim() || null) : form[k];
      return updateDealerPolicy(d.id, body as Parameters<typeof updateDealerPolicy>[1]);
    },
    onSuccess: (next) => {
      setDetail(next);
      setReason('');
      setErrors({});
      setFormError(null);
      toast.success('Bayi AI ayarları kaydedildi; en geç 30 sn içinde tüm yollara yansır.');
    },
    onError: (e) => {
      if (isConflict(e)) {
        setFormError('Bu ayarlar siz düzenlerken (muhtemelen bayi tarafından) değişti. Güncel hâl yüklendi; değişikliklerinizi yeniden uygulayın.');
        qc.invalidateQueries({ queryKey: studioKeys.dealer(d.id) });
        return;
      }
      setErrors(fieldErrors(e));
      setFormError(errorText(e));
    },
  });

  const refresh = useMutation({
    mutationFn: () => refreshDealerProfile(d.id),
    onSuccess: (next) => {
      setDetail(next);
      toast.success('Öğrenme profili yenilendi.');
    },
  });

  const enoughData = d.feedbackWithText >= d.minFeedbackForProfile;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="font-medium text-fg">{d.name}</p>
        {d.email ? <p className="qx-small text-fg-muted">{d.email}</p> : null}
        <p className="qx-small text-fg-muted">
          Son 7 gün: {fmtNumber(d.usage7d.calls)} AI çağrısı · {fmtNumber(d.usage7d.failures)} hata · {fmtNumber(d.usage7d.tokens)} token
          {d.policy.isDefault ? ' · ayar satırı yok (varsayılanlar geçerli)' : ''}
        </p>
      </div>

      <form
        aria-labelledby={`${baseId}-policy`}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          if (!dirty) return setFormError('Değişiklik yok.');
          if (!reasonOk(reason)) return setFormError('Gerekçe en az 3 karakter olmalı.');
          save.mutate();
        }}
      >
        <h3 id={`${baseId}-policy`} className="font-medium text-fg">
          AI politikası
        </h3>
        <p className="qx-small text-fg-muted">
          Bayi de aynı ayarları kendi panelinden değiştirebilir; burada yaptığınız değişiklik yönetici adıyla ve gerekçeyle denetim kaydına düşer.
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {SWITCHES.map((s) => {
            const id = `${baseId}-${s.key}`;
            const inert = s.dependsOnAi && !form.isEnabled;
            return (
              <li key={s.key} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Label htmlFor={id} className="font-medium">
                    {POLICY_FIELD_LABELS[s.key]}
                  </Label>
                  <p id={`${id}-d`} className="qx-small text-fg-muted">
                    {s.hint}
                    {inert ? ' AI ana anahtarı kapalıyken etkisiz (değeri korunur).' : ''}
                  </p>
                </div>
                <Switch
                  id={id}
                  checked={form[s.key]}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, [s.key]: v }))}
                  aria-describedby={`${id}-d`}
                  className={cn(inert && 'opacity-60')}
                />
              </li>
            );
          })}
        </ul>
        <CountedTextarea
          label={POLICY_FIELD_LABELS.customPrompt}
          value={form.customPrompt}
          onChange={(v) => setForm((f) => ({ ...f, customPrompt: v }))}
          max={DEALER_AI_CONTEXT_MAX}
          rows={5}
          error={errors.customPrompt}
          hint="Yalnız bu bayinin analizine, sınırlı ek bağlam olarak eklenir; talimat/kod/bağlantı içeren metin reddedilir."
        />
        <ReasonInput value={reason} onChange={setReason} error={errors.reason} />
        {formError ? <InlineError variant="banner">{formError}</InlineError> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={save.isPending || !dirty}>
            {save.isPending ? 'Kaydediliyor…' : dirty ? `${changedKeys.length} değişikliği kaydet` : 'Kaydedilecek değişiklik yok'}
          </Button>
          {dirty ? (
            <Button type="button" variant="ghost" className="min-h-11 sm:min-h-10" onClick={() => setForm(original)}>
              Geri al
            </Button>
          ) : null}
        </div>
      </form>

      <section aria-labelledby={`${baseId}-profile`} className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${baseId}-profile`} className="font-medium text-fg">
            Öğrenme profili
          </h3>
          {d.retrain.shouldRetrain ? <StatusBadge size="sm" tone="warning" label="Yeniden eğitim önerilir" /> : null}
        </div>
        {d.retrain.reason ? <p className="qx-small text-fg-muted">{d.retrain.reason}</p> : null}
        <p className="qx-small text-fg-muted">
          Son eğitimden beri {fmtNumber(d.retrain.newFeedbackCount)} yeni geri bildirim, {fmtNumber(d.retrain.newCorrectionsCount)} yeni düzeltme. Profil, yeni veri eşiği aşıldığında otomatik de yenilenir.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmAction
            tone="brand"
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={!enoughData || refresh.isPending}>
                <RefreshCw className={cn('h-4 w-4', refresh.isPending && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                {refresh.isPending ? 'Yenileniyor…' : 'Profili şimdi yenile'}
              </Button>
            }
            title="Öğrenme profili yenilensin mi?"
            description="Bu bayinin son 200 geri bildirimi ve düzeltmesi AI sağlayıcısına gönderilir (bayinin AI'ı kapalıysa yerel, deterministik profil üretilir). Bayi günlük token tavanı uygulanır."
            irreversibleNote={false}
            confirmLabel="Yenile"
            onConfirm={() => refresh.mutateAsync()}
          />
          {!enoughData ? (
            <p className="qx-small text-fg-muted">
              Yetersiz veri ({fmtNumber(d.feedbackWithText)}/{d.minFeedbackForProfile} metinli geri bildirim).
            </p>
          ) : null}
        </div>
        {d.profile ? <ProfileView d={d} /> : <EmptyState compact title="Profil yok" description="Yeterli veri oluştuğunda profil otomatik oluşur ya da buradan yenileyebilirsiniz." />}
      </section>

      <section aria-labelledby={`${baseId}-corr`} className="space-y-2 border-t border-border pt-4">
        <h3 id={`${baseId}-corr`} className="font-medium text-fg">
          Son düzeltmeler
        </h3>
        {d.corrections.length === 0 ? (
          <p className="qx-small text-fg-muted">Bayi henüz AI analizini düzeltmemiş.</p>
        ) : (
          <ol className="space-y-2">
            {d.corrections.map((c) => (
              <li key={c.id} className="rounded-md border border-border p-2 text-sm">
                <p>
                  <span className="font-medium">{c.field}</span> <span className="text-fg-muted">· {fmtDateTime(c.at)}</span>
                </p>
                <p className="break-words text-fg-muted">
                  <span className="line-through">{c.oldValue}</span> → <span className="text-fg">{c.newValue}</span>
                </p>
                {c.note ? <p className="qx-small text-fg-muted">Not: {c.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ProfileView({ d }: { d: DealerDetail }) {
  const p = d.profile!;
  const PRI: Record<string, string> = { high: 'yüksek', medium: 'orta', low: 'düşük' };
  return (
    <div className="space-y-4">
      <KeyValueList
        layout="grid"
        columns={2}
        dense
        items={[
          { label: 'Sürüm', value: String(p.version) },
          { label: 'Son eğitim', value: fmtDateTime(p.lastTrainedAt) },
          { label: 'Eğitimde kullanılan geri bildirim', value: fmtNumber(p.trainingFeedbackCount) },
          { label: 'Kullanılan düzeltme', value: fmtNumber(p.correctionsUsed) },
          { label: 'Sektör', value: p.businessContext.sector ?? '—' },
          { label: 'Anahtar terimler', value: p.businessContext.keyTerms.join(', ') || '—' },
        ]}
      />
      {p.themes.length ? (
        <div className="space-y-1">
          <h4 className="qx-small font-medium text-fg">Temalar</h4>
          <ul className="flex flex-wrap gap-1.5">
            {p.themes.map((t) => (
              <li key={t.theme}>
                <StatusBadge size="sm" tone={t.priority === 'high' ? 'danger' : t.priority === 'low' ? 'neutral' : 'warning'} label={`${t.theme} · ${PRI[t.priority] ?? t.priority}`} title={t.note ?? undefined} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.risks.length ? (
        <div className="space-y-1">
          <h4 className="qx-small font-medium text-fg">Risk kalıpları</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {p.risks.map((r) => (
              <li key={r.pattern}>
                {r.pattern}
                {r.action ? <span className="text-fg-muted"> → {r.action}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <h4 className="qx-small font-medium text-fg">Yap</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">{p.guidelines.do.length ? p.guidelines.do.map((x) => <li key={x}>{x}</li>) : <li className="list-none text-fg-muted">—</li>}</ul>
        </div>
        <div className="space-y-1">
          <h4 className="qx-small font-medium text-fg">Kaçın</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">{p.guidelines.avoid.length ? p.guidelines.avoid.map((x) => <li key={x}>{x}</li>) : <li className="list-none text-fg-muted">—</li>}</ul>
        </div>
      </div>
      {p.entities.length ? (
        <details>
          <summary className="qx-small min-h-11 cursor-pointer content-center text-brand">Varlık eşlemeleri ({p.entities.length})</summary>
          <ul className="mt-1 space-y-0.5 text-sm">
            {p.entities.map((e) => (
              <li key={`${e.alias}-${e.canonical}`}>
                {e.alias} → <span className="font-medium">{e.canonical}</span> <span className="text-fg-muted">({e.type})</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
