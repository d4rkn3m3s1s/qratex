'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, HeartHandshake, Inbox, Info, ScanSearch, Send, Timer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PanelPage, PageHeader, PageGrid, SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { DirtyBar, Field } from '@/components/ds/form';
import { InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { useMotionPolicy } from '@/lib/motion';
import {
  REMEDY_LIMITS,
  remedyConfigSchema,
  renderRemedyMessage,
  type RemedyAutomationConfig,
} from '@/lib/dealer-automation/remedy-config';
import { AUTOMATION_KEYS, type RemedyOverviewDto, type RemedyScanResultDto } from '@/lib/dealer-automation/types';
import { AutomationApiError, errorText, fetchRemedy, fmtInt, fmtRelative, saveRemedyConfig, scanRemedy } from './api';
import { AutomationNav } from './automation-nav';

// Katalog düzenleyicisi sayfanın altındadır; ilk boyamayı bekletmez.
const RemedyCatalog = dynamic(() => import('./remedy-catalog').then((mod) => mod.RemedyCatalog), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-card bg-surface-2" aria-hidden />,
});

const SKIP_LABEL: Record<string, string> = {
  monthly_limit: 'aylık sınır doldu',
  already_exists: 'bu arada teklif açıldı',
  cooldown: 'bekleme süresinde',
  no_options: 'geçerli telafi seçeneği yok',
  not_eligible: 'artık uygun değil',
  no_user: 'anonim',
  disabled: 'otomasyon kapalı',
};

export function RemedyScreen() {
  const q = useQuery({ queryKey: AUTOMATION_KEYS.remedy, queryFn: ({ signal }) => fetchRemedy(signal), staleTime: 30_000 });
  const moduleOff = q.error instanceof AutomationApiError && q.error.code === 'MODULE_DISABLED';
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Otomasyon"
          title="Telafi otomasyonu"
          description="Mutsuz müşteriler için telafi taslağını kendiliğinden hazırlar. Taslaklar müşteriye gitmez; Gelen Kutusu › Telafi onayı'nda siz yayınlarsınız."
          icon={<HeartHandshake className="h-5 w-5" aria-hidden />}
          meta={<AutomationNav />}
          actions={
            q.data ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/dealer/inbox/remedy">
                  <Inbox className="mr-2 h-4 w-4" aria-hidden />
                  Onay kuyruğu{q.data.stats.awaiting > 0 ? ` (${fmtInt(q.data.stats.awaiting)})` : ''}
                </Link>
              </Button>
            ) : null
          }
        />
      }
    >
      <QueryState
        query={q}
        skeleton="form"
        isEmpty={() => false}
        errorKind={moduleOff ? 'moduleDisabled' : undefined}
      >
        {(data) => <RemedyBody data={data} />}
      </QueryState>
    </PanelPage>
  );
}

function RemedyBody({ data }: { data: RemedyOverviewDto }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RemedyAutomationConfig>(data.config);
  const savedKey = JSON.stringify(data.config);
  useEffect(() => setDraft(data.config), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== savedKey;
  const parsed = remedyConfigSchema.safeParse(draft);
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
    return out;
  }, [parsed]);

  const save = useMutation({
    mutationFn: () => saveRemedyConfig(draft),
    onSuccess: async () => {
      toast.success(draft.enabled ? 'Ayar kaydedildi. Otomasyon açık.' : 'Ayar kaydedildi. Otomasyon kapalı.');
      await qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.remedy });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const set = <K extends keyof RemedyAutomationConfig>(k: K, v: RemedyAutomationConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const general = data.catalog.scopes.find((s) => s.locationId === null);

  return (
    <>
      <StatusStrip data={data} />
      <Kpis data={data} />

      <PageGrid cols={2}>
        <SectionCard title="Kurallar" description="Ne zaman taslak hazırlansın, ne kadar?">
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-card border border-subtle p-3">
              <div>
                <p id="remedy-enabled-label" className="text-sm font-medium text-fg">
                  Otomasyon açık
                </p>
                <p id="remedy-enabled-desc" className="qx-small text-fg-muted">
                  Açıkken her yeni geri bildirimde gerçek zamanlı değerlendirilir; geriye dönük tarama da yalnız açıkken çalışır.
                </p>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => set('enabled', v)}
                aria-labelledby="remedy-enabled-label"
                aria-describedby="remedy-enabled-desc"
              />
            </div>

            <Field kind="labelledby" label="Puan eşiği" required description="Bu puan ve altındaki yorumlar için taslak hazırlanır." error={errors.minRating}>
              {(p) => (
                <ChoiceChips
                  aria-labelledby={p['aria-labelledby'] as string}
                  options={[1, 2, 3].map((n) => ({ value: String(n), label: n === 1 ? '1 ★' : `${n} ★ ve altı`, textLabel: n === 1 ? '1 yıldız' : `${n} yıldız ve altı` }))}
                  value={String(draft.minRating)}
                  onChange={(v) => v && set('minRating', Number(v))}
                />
              )}
            </Field>

            <div className="space-y-2 rounded-card border border-subtle p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="remedy-churn-label" className="text-sm font-medium text-fg">
                    Kayıp riski yüksekse de hazırla
                  </p>
                  <p className="qx-small text-fg-muted">
                    Puanı eşiğin üstünde olsa bile AI analizi müşteriyi kaybetme riskini yüksek bulursa.
                    {data.aiAnalyze === false && <strong className="text-warning"> Otomatik AI analiziniz kapalı; bu tetik şu an çalışmaz.</strong>}
                  </p>
                </div>
                <Switch checked={draft.churnEnabled} onCheckedChange={(v) => set('churnEnabled', v)} aria-labelledby="remedy-churn-label" />
              </div>
              {draft.churnEnabled && (
                <Field kind="labelledby" label="Risk eşiği" error={errors.churnThreshold}>
                  {(p) => (
                    <ChoiceChips
                      aria-labelledby={p['aria-labelledby'] as string}
                      size="sm"
                      options={[0.5, 0.6, 0.7, 0.8, 0.9].map((n) => ({ value: String(n), label: `%${Math.round(n * 100)}+` }))}
                      value={String(draft.churnThreshold)}
                      onChange={(v) => v && set('churnThreshold', Number(v))}
                    />
                  )}
                </Field>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <IntField
                label="Aylık üst sınır"
                description="Bu ay (İstanbul saatiyle) en fazla kaç OTOMATİK taslak. Elle açtığınız teklifler sayılmaz."
                value={draft.maxMonthlyAuto}
                min={REMEDY_LIMITS.maxMonthlyAuto.min}
                max={REMEDY_LIMITS.maxMonthlyAuto.max}
                error={errors.maxMonthlyAuto}
                onChange={(n) => set('maxMonthlyAuto', n)}
              />
              <IntField
                label="Tarama başına en fazla"
                description="“Geriye dönük tara” bir seferde en çok bu kadar taslak ekler."
                value={draft.maxPerRun}
                min={REMEDY_LIMITS.maxPerRun.min}
                max={REMEDY_LIMITS.maxPerRun.max}
                error={errors.maxPerRun}
                onChange={(n) => set('maxPerRun', n)}
              />
            </div>

            <Field kind="labelledby" label="Müşteri başına bekleme" description="Son bu kadar günde teklif almış müşteriye yeni otomatik taslak hazırlanmaz (düşük puanla telafi toplamaya karşı)." error={errors.cooldownDays}>
              {(p) => (
                <ChoiceChips
                  aria-labelledby={p['aria-labelledby'] as string}
                  size="sm"
                  options={[0, 7, 14, 30, 60, 90].map((n) => ({ value: String(n), label: n === 0 ? 'Yok' : `${n} gün` }))}
                  value={String(draft.cooldownDays)}
                  onChange={(v) => v != null && set('cooldownDays', Number(v))}
                />
              )}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Müşteriye giden mesaj" description="Taslakla birlikte gider; onay kuyruğunda düzenleyebilirsiniz.">
          <div className="space-y-3">
            <Field
              label="Mesaj"
              required
              error={errors.messageTemplate}
              description="{{musteri}} müşterinin adı, {{isletme}} işletme adınızla doldurulur."
              footer={
                <span className={cn('qx-caption tabular-nums', draft.messageTemplate.length > REMEDY_LIMITS.message.max ? 'text-danger' : 'text-fg-muted')}>
                  {fmtInt(draft.messageTemplate.length)}/{fmtInt(REMEDY_LIMITS.message.max)}
                </span>
              }
            >
              {(p) => (
                <Textarea
                  {...p}
                  rows={5}
                  value={draft.messageTemplate}
                  maxLength={REMEDY_LIMITS.message.max}
                  onChange={(e) => set('messageTemplate', e.target.value)}
                />
              )}
            </Field>
            <CustomerPreview
              message={renderRemedyMessage(draft.messageTemplate, { musteri: 'Ayşe Yılmaz', isletme: 'İşletmeniz' })}
              options={general?.effective.options ?? []}
              source={general?.effective.source ?? 'system'}
            />
          </div>
        </SectionCard>
      </PageGrid>

      <CoverageNote data={data} />
      {/* Kayıtlı ayar değişince eski kuru çalıştırma sonucu (ve "N taslağı ekle" düğmesi) düşer. */}
      <ScanPanel key={savedKey} savedEnabled={data.config.enabled} dirty={dirty} />

      <section id="katalog" aria-labelledby="katalog-title" className="scroll-mt-24 space-y-3">
        <div>
          <h2 id="katalog-title" className="text-lg font-semibold text-fg">
            Teklif kataloğu
          </h2>
          <p className="qx-small text-fg-muted">
            Müşterinin seçebileceği telafiler. Şubeye özel set tanımlarsanız o şubenin QR kodlarından gelen yorumlarda işletme seti yerine o kullanılır.
          </p>
        </div>
        <RemedyCatalog catalog={data.catalog} />
      </section>

      <DirtyBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() => {
          if (!parsed.success) {
            toast.error('Bazı alanlar geçersiz. Kırmızı işaretli alanları düzeltin.');
            return;
          }
          save.mutate();
        }}
        onDiscard={() => setDraft(data.config)}
        message="Kaydedilmemiş telafi ayarları var"
      />
    </>
  );
}

function IntField({
  label,
  description,
  value,
  min,
  max,
  error,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  error?: string;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Field label={label} description={description} error={error} required>
      {(p) => (
        <Input
          {...p}
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
            setText(t);
            if (t) onChange(Number(t));
          }}
          onBlur={() => {
            const n = Math.min(max, Math.max(min, Number(text) || min));
            setText(String(n));
            onChange(n);
          }}
          className="min-h-11 tabular-nums"
        />
      )}
    </Field>
  );
}

function StatusStrip({ data }: { data: RemedyOverviewDto }) {
  const policy = useMotionPolicy();
  const { stats, config } = data;
  const ratio = stats.cap > 0 ? Math.min(1, stats.monthUsed / stats.cap) : 0;
  return (
    <div className="grid gap-3 rounded-card border border-subtle bg-surface-1 p-4 sm:grid-cols-[auto,1fr] sm:items-center">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3" aria-hidden>
          {config.enabled && !policy.reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cn('relative inline-flex h-3 w-3 rounded-full', config.enabled ? 'bg-success' : 'bg-fg-subtle')} />
        </span>
        <div>
          <p className="text-sm font-semibold text-fg">{config.enabled ? 'Açık · gerçek zamanlı' : 'Kapalı'}</p>
          <p className="qx-caption text-fg-muted">
            Son otomatik taslak: {fmtRelative(stats.lastAutoAt)}
            {stats.lastScan ? ` · son tarama: ${fmtRelative(stats.lastScan.at)}` : ''}
          </p>
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span id="remedy-quota-label" className="qx-small text-fg-muted">
            Bu ayki otomatik taslak
          </span>
          <span className="text-sm font-semibold tabular-nums text-fg">
            {fmtInt(stats.monthUsed)} / {fmtInt(stats.cap)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-labelledby="remedy-quota-label"
          aria-valuemin={0}
          aria-valuemax={stats.cap}
          aria-valuenow={stats.monthUsed}
          className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <Motion.div
            className={cn('h-full rounded-full', ratio >= 1 ? 'bg-danger' : ratio >= 0.8 ? 'bg-warning' : 'bg-brand')}
            initial={policy.reduce ? false : { width: 0 }}
            animate={{ width: `${Math.round(ratio * 100)}%` }}
            transition={{ duration: policy.reduce ? 0 : 0.5, ease: 'easeOut' }}
          />
        </div>
        {ratio >= 1 && <p className="mt-1 qx-caption text-danger">Aylık sınır doldu; yeni taslak ay başında (İstanbul) açılır ya da sınırı artırın.</p>}
      </div>
    </div>
  );
}

function Kpis({ data }: { data: RemedyOverviewDto }) {
  const s = data.stats;
  return (
    <MetricGrid cols={4}>
      <MetricTile label="Bu ay hazırlanan" metric={{ value: s.month.queued }} icon={<ClipboardList className="h-4 w-4" aria-hidden />} />
      <MetricTile label="Onay bekleyen" metric={{ value: s.awaiting }} icon={<Timer className="h-4 w-4" aria-hidden />} href="/dealer/inbox/remedy" tone={s.awaiting > 0 ? 'warning' : undefined} />
      <MetricTile
        label="Yayınlanan / reddedilen"
        metric={{ value: s.month.published }}
        icon={<Send className="h-4 w-4" aria-hidden />}
        hint={`Bu ayki otomatik taslaklardan ${fmtInt(s.month.rejected)} tanesi reddedildi.`}
      />
      <MetricTile
        label="Müşteri kabul oranı"
        metric={{ value: s.acceptRate == null ? null : s.acceptRate * 100, format: 'percent', fractionDigits: 0, n: s.month.published, minN: 5 }}
        icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
        hint={s.acceptRate == null ? 'Bu ay yayınlanan otomatik teklif yok.' : `${fmtInt(s.month.accepted)}/${fmtInt(s.month.published)} yayınlanan teklif kabul edildi.`}
      />
    </MetricGrid>
  );
}

function CustomerPreview({ message, options, source }: { message: string; options: RemedyOverviewDto['catalog']['defaults']; source: string }) {
  return (
    <div className="rounded-card border border-subtle bg-surface-2 p-3" aria-label="Müşteri önizlemesi (örnek ad: Ayşe Yılmaz)">
      <p className="qx-caption text-fg-muted">Müşterinin göreceği (işletme geneli)</p>
      <p className="mt-1 text-sm text-fg">{message}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <li key={o.type} className="rounded-chip border border-subtle bg-surface-1 px-2 py-1 qx-caption text-fg">
            {o.label}: {o.values.map((v) => (o.type === 'discount' ? `%${v}` : `${v}`)).join(' · ')} {o.type !== 'discount' ? o.unit : ''}
          </li>
        ))}
      </ul>
      {source === 'system' && <p className="mt-2 qx-caption text-fg-muted">Katalog tanımlamadığınız için sistem varsayılanı kullanılıyor.</p>}
    </div>
  );
}

function CoverageNote({ data }: { data: RemedyOverviewDto }) {
  return (
    <aside className="flex gap-3 rounded-card border border-subtle bg-surface-1 p-4" aria-label="Otomasyonun kapsamı">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
      <ul className="qx-small list-disc space-y-1 pl-4 text-fg-muted">
        <li>QR geri bildirimleri kapsanır; puan tetiği AI'dan bağımsızdır (metinsiz 1 yıldız da yakalanır).</li>
        <li>Anonim bırakılan geri bildirimlere teklif gönderilemez, atlanır.</li>
        <li>İşletme sahibi ya da personelinin yazdığı ya da güvenlik denetiminin şüpheli bulduğu (güven işaretli) yorumlara taslak hazırlanmaz.</li>
        <li>Bir yoruma daha önce teklif açıldıysa (reddettikleriniz dahil) yeniden hazırlanmaz.</li>
        <li>
          Kayıp riski tetiği AI analizi gerektirir{data.aiAnalyze === false ? ' — şu an kapalı' : ''}. Tüketim (kasa) yorumları bu otomasyonun dışındadır; onlar için
          Gelen Kutusu'ndan elle teklif açın.
        </li>
      </ul>
    </aside>
  );
}

function ScanPanel({ savedEnabled, dirty }: { savedEnabled: boolean; dirty: boolean }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<RemedyScanResultDto | null>(null);
  const run = useMutation({
    mutationFn: (dryRun: boolean) => scanRemedy(dryRun),
    onSuccess: async (r) => {
      setResult(r);
      if (!r.dryRun) {
        toast.success(r.queued > 0 ? `${r.queued} taslak onay kuyruğuna eklendi.` : 'Kuyruğa eklenecek uygun yorum bulunamadı.');
        await qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.remedy });
      }
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const blockedReason = !savedEnabled ? 'Önce otomasyonu açıp kaydedin.' : dirty ? 'Tarama kayıtlı ayarlarla çalışır; önce değişiklikleri kaydedin.' : null;
  return (
    <SectionCard
      title="Geriye dönük tarama"
      description="Son 14 günün eşik altındaki (ya da açıksa kayıp riski yüksek) yorumlarını tarar. Önce dener, sonra onaylarsanız kuyruğa ekler."
      icon={<ScanSearch className="h-4 w-4" aria-hidden />}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" disabled={!!blockedReason || run.isPending} onClick={() => run.mutate(true)}>
            Önce dene
          </Button>
          {result?.dryRun && result.queued > 0 && (
            <Button className="min-h-11" disabled={!!blockedReason || run.isPending} onClick={() => run.mutate(false)}>
              {fmtInt(result.queued)} taslağı kuyruğa ekle
            </Button>
          )}
        </div>
        {blockedReason && <p className="qx-small text-fg-muted">{blockedReason}</p>}
        {run.isError && <InlineError>{errorText(run.error)}</InlineError>}
        {result && (
          <div className="rounded-card border border-subtle p-3" aria-live="polite">
            <p className="text-sm font-medium text-fg">
              {result.dryRun
                ? `${fmtInt(result.found)} yorum bulundu; ${fmtInt(result.queued)} taslak eklenebilir.`
                : `${fmtInt(result.queued)} taslak kuyruğa eklendi.`}
            </p>
            <ul className="mt-2 grid gap-1 qx-small text-fg-muted sm:grid-cols-2">
              <li>Uygun: {fmtInt(result.eligible)}</li>
              <li>Anonim (atlandı): {fmtInt(result.anonymous)}</li>
              <li>Teklifi zaten var: {fmtInt(result.alreadyOffered)}</li>
              <li>Bekleme süresinde / aynı müşteri: {fmtInt(result.cooldown)}</li>
              <li>Bu ay kalan hak: {fmtInt(result.capRemaining)}</li>
              <li>Tarama başına sınır: {fmtInt(result.perRun)}</li>
              {Object.entries(result.skipped).map(([k, n]) => (
                <li key={k}>
                  <XCircle className="mr-1 inline h-3 w-3" aria-hidden />
                  {SKIP_LABEL[k] ?? k}: {fmtInt(n)}
                </li>
              ))}
            </ul>
            {!result.dryRun && result.queued > 0 && (
              <Button asChild variant="link" className="mt-1 h-auto min-h-11 px-0">
                <Link href="/dealer/inbox/remedy">Onay kuyruğuna git</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

