'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileJson,
  Globe,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, PanelPage, SectionTabs, useUrlState } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { DirtyBar, Field } from '@/components/ds/form';
import { ConfirmAction, QueryState, TONE_CALLOUT } from '@/components/states';
import { useNumberTicker, useReducedMotionPref } from '@/lib/motion';
import {
  DEFAULT_DISALLOW,
  diffSeoPayload,
  newlyDangerous,
  parseSeoPayload,
  renderRobotsTxt,
  tabForPath,
  type DangerFlag,
  type HealthCheck,
  type HealthReport,
  type SeoHistoryEntry,
  type SeoPayload,
  type SeoState,
  type SeoTab,
} from '@/lib/admin-seo/contract';
import { resolveSeoBaseUrl } from '@/lib/seo-url';
import { cn } from '@/lib/utils';
import { SurfaceApiError, errorText, fetchSeo, isStatus, restoreSeo, runHealth, saveSeo, seoKeys, type SeoBundle } from './api';
import { fmtAbs, relTime } from './format';
import { ChipInput, OverrideRows, PathListEditor, SitemapRows, TextRow } from './seo-fields';
import { SeoPreview } from './seo-preview';
import { SeoHistorySheet } from './seo-history';
import { sameAsSaved, toDraft, validateDraft, type Draft, type DraftGlobal } from './seo-draft';
import { useSourceT } from '@/components/ds/page/source-dict';
import { SEO_DICT, useSeoCopy } from './copy';

const TABS: Array<{ value: SeoTab; label: string }> = [
  { value: 'genel', label: 'Genel' },
  { value: 'sosyal', label: 'Sosyal' },
  { value: 'yapisal', label: 'Yapısal veri' },
  { value: 'tarama', label: 'Tarama' },
  { value: 'sayfalar', label: 'Sayfalar' },
];


/**
 * SEO Motoru (/admin/seo) — arama görünürlüğü kontrol merkezi. ops kaydı; 3B yok.
 * İlk bakış: site indekslenebilir mi, kaç sorun var, son değişikliği kim yaptı?
 * Düzenleme: tek şema doğrulaması, kirli durum çubuğu, tehlikeli değişiklikte yazılı onay,
 * iyimser kilit, sürüm geçmişi + geri yükleme, canlı SERP/sosyal önizleme.
 */
export function SeoConsole({ initial, envSiteUrl }: { initial: SeoBundle | null; envSiteUrl: string }) {
  const query = useQuery({
    queryKey: seoKeys.state(),
    queryFn: ({ signal }) => fetchSeo(signal),
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });
  return (
    <QueryState query={query} skeleton="form" className="mx-auto max-w-7xl p-4">
      {(bundle) => <SeoEditor bundle={bundle} envSiteUrl={envSiteUrl} refetch={() => query.refetch().then((r) => r.data ?? null)} />}
    </QueryState>
  );
}

function SeoEditor({ bundle, envSiteUrl, refetch }: { bundle: SeoBundle; envSiteUrl: string; refetch: () => Promise<SeoBundle | null> }) {
  const fz = useSeoCopy().fx;
  const L = useSourceT(SEO_DICT);
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const qc = useQueryClient();
  const url = useUrlState();
  const [saved, setSaved] = useState<SeoState>(bundle.state);
  const [draft, setDraft] = useState<Draft>(() => toDraft(bundle.state.payload));
  const [submitted, setSubmitted] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(bundle.health);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [danger, setDanger] = useState<{ flags: DangerFlag[]; run: () => Promise<unknown> } | null>(null);
  const [focusPath, setFocusPath] = useState('/');
  const tab = (TABS.some((t) => t.value === url.get('sekme')) ? url.get('sekme') : 'genel') as SeoTab;
  const setTab = (t: string) => url.set({ sekme: t === 'genel' ? null : t });

  const validation = useMemo(() => validateDraft(draft), [draft]);
  const dirty = useMemo(() => !sameAsSaved(draft, saved.payload), [draft, saved]);
  const errors = submitted ? validation.errors : {};
  const errorCount = (t: SeoTab) => Object.keys(validation.errors).filter((k) => tabForPath(k.startsWith('override.') ? 'pageOverrides' : k.startsWith('sitemap.') ? 'extraSitemapUrls' : k) === t).length;
  const base = resolveSeoBaseUrl(saved.payload.global, envSiteUrl);
  const g = draft.global;
  const setG = (patch: Partial<DraftGlobal>) => setDraft((d) => ({ ...d, global: { ...d.global, ...patch } }));

  const adopt = (state: SeoState) => {
    setSaved(state);
    setDraft(toDraft(state.payload));
    setSubmitted(false);
    setConflict(false);
    qc.setQueryData(seoKeys.state(), (old: SeoBundle | undefined) => ({ state, health: old?.health ?? health }));
    void qc.invalidateQueries({ queryKey: seoKeys.history() });
  };

  const persist = useMutation({
    mutationFn: (v: { payload: SeoPayload; confirm: boolean }) => saveSeo(v.payload, saved.updatedAt, v.confirm),
    onSuccess: (r) => {
      adopt(r.state);
      toast.success(ux.seoAyarlariKaydedildiVe);
    },
    onError: (e, v) => {
      if (isStatus(e, 409)) setConflict(true);
      else if (isStatus(e, 428)) {
        const flags = ((e as SurfaceApiError).details as { flags?: DangerFlag[] } | undefined)?.flags ?? [];
        setDanger({ flags, run: () => persist.mutateAsync({ payload: v.payload, confirm: true }) });
      } else toast.error(errorText(e));
    },
  });

  const focusField = (field: string, t: SeoTab) => {
    setTab(t);
    window.setTimeout(() => {
      const el = document.getElementById(`seo-${field}`) as HTMLElement | null;
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  };

  const onSave = () => {
    setSubmitted(true);
    if (!validation.ok) {
      const first = Object.keys(validation.errors)[0];
      const t = tabForPath(first.startsWith('override.') ? 'pageOverrides' : first.startsWith('sitemap.') ? 'extraSitemapUrls' : first);
      toast.error(fz.fieldErrors(Object.keys(validation.errors).length));
      setTab(t);
      return;
    }
    const payload = validation.data;
    const flags = newlyDangerous(saved.updatedAt ? saved.payload.global : null, payload.global);
    if (flags.length) setDanger({ flags, run: () => persist.mutateAsync({ payload, confirm: true }) });
    else persist.mutate({ payload, confirm: false });
  };

  const reloadLatest = async () => {
    const latest = await refetch();
    if (latest) {
      adopt(latest.state);
      toast.message(ux.guncelSurumYuklendiDegisikliklerinizi2);
    }
  };

  const restore = async (entry: SeoHistoryEntry, confirm = false): Promise<unknown> => {
    try {
      const r = await restoreSeo(entry.id, saved.updatedAt, confirm);
      adopt(r.state);
      setHistoryOpen(false);
      toast.success(fz.restored(fmtAbs(entry.createdAt)));
    } catch (e) {
      if (isStatus(e, 428)) {
        const flags = ((e as SurfaceApiError).details as { flags?: DangerFlag[] } | undefined)?.flags ?? [];
        setDanger({ flags, run: () => restore(entry, true) });
        return;
      }
      if (isStatus(e, 409)) setConflict(true);
      throw e;
    }
  };

  const healthRun = useMutation({
    mutationFn: runHealth,
    onSuccess: (r) => {
      setHealth(r.report);
      qc.setQueryData(seoKeys.state(), (old: SeoBundle | undefined) => (old ? { ...old, health: r.report } : old));
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={
        <PageHeader
          eyebrow={ux.buyume}
          title={ux.seoMotoru}
          description={ux.siteninAramaMotorlarindaVe}
          icon={<Search />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" aria-hidden /> {ux.gecmis}
              </Button>
              <ImportExport saved={saved.payload} onApply={(p) => { setDraft(toDraft(p)); setSubmitted(true); }} />
              <Button asChild variant="ghost" className="min-h-11 sm:min-h-10">
                <a href={base} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden /> {sx.openSite}<span className="sr-only">{sx.newTabShort}</span>
                </a>
              </Button>
            </div>
          }
        />
      }
      aside={<SeoPreview draft={draft} base={base} focusPath={focusPath} onFocusPath={setFocusPath} />}
      asideLabel={ux.canliOnizleme}
      asideWidth="lg"
      asideSticky
      asideOnMobile="after"
    >
      <div className="space-y-6 pb-28">
        <StatusStrip saved={saved} health={health} onHistory={() => setHistoryOpen(true)} />
        {saved.repairedKeys.length ? (
          <div className={cn('rounded-card border p-3 text-sm', TONE_CALLOUT.warning)} role="status">
            {fz.repaired(saved.repairedKeys.join(', '))}
          </div>
        ) : null}

        <HealthPanel report={health} running={healthRun.isPending} dirty={dirty} onRun={() => healthRun.mutate()} onFix={(c) => c.fix && focusField(c.fix.field, c.fix.tab)} />

        <SectionTabs
          tabs={TABS.map((t) => ({ value: t.value, label: L(t.label), count: submitted && errorCount(t.value) ? errorCount(t.value) : undefined }))}
          value={tab}
          onValueChange={setTab}
          ariaLabel={ux.seoAyarBolumleri}
          touchTarget
        >
          {(active) => (
            <div className="space-y-5 pt-4">
              {active === 'genel' ? (
                <>
                  <TextRow name="defaultTitle" label={ux.varsayilanBaslik} required value={g.defaultTitle} onChange={(v) => setG({ defaultTitle: v })} error={errors.defaultTitle} meter={{ min: 10, max: 60 }} description={ux.anaSayfaninTitleEtiketi} />
                  <TextRow name="defaultDescription" label={ux.varsayilanMetaAciklama} required multiline value={g.defaultDescription} onChange={(v) => setG({ defaultDescription: v })} error={errors.defaultDescription} meter={{ min: 70, max: 160 }} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextRow name="siteName" label={ux.siteAdi} required value={g.siteName} onChange={(v) => setG({ siteName: v })} error={errors.siteName} description={ux.baslikSablonuSiteAdi} />
                    <TextRow name="locale" label={ux.dilBolge} required value={g.locale} onChange={(v) => setG({ locale: v })} error={errors.locale} description={ux.xxXxBicimiOr} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextRow name="siteUrl" type="url" label={ux.siteUrl} required value={g.siteUrl} onChange={(v) => setG({ siteUrl: v })} error={errors.siteUrl} description={ux.zorunluBosYaDa} />
                    <TextRow name="canonicalBase" type="url" label={ux.canonicalTabani} value={g.canonicalBase} onChange={(v) => setG({ canonicalBase: v })} error={errors.canonicalBase} description={ux.bossaSiteUrlKullanilir} />
                  </div>
                  <ChipInput name="keywords" label={ux.anahtarKelimeler} value={g.keywords} onChange={(v) => setG({ keywords: v })} error={errors.keywords} description={ux.metaKeywordsEtiketineYazilir} />
                </>
              ) : null}

              {active === 'sosyal' ? (
                <>
                  <TextRow name="ogImageUrl" label={ux.ogGorsel} value={g.ogImageUrl} onChange={(v) => setG({ ogImageUrl: v })} error={errors.ogImageUrl} description={ux.httpsAdresYaDa} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextRow name="ogImageWidth" label={ux.genislikPx} inputMode="numeric" value={g.ogImageWidth} onChange={(v) => setG({ ogImageWidth: v.replace(/[^\d]/g, '') })} error={errors.ogImageWidth} />
                    <TextRow name="ogImageHeight" label={ux.yukseklikPx} inputMode="numeric" value={g.ogImageHeight} onChange={(v) => setG({ ogImageHeight: v.replace(/[^\d]/g, '') })} error={errors.ogImageHeight} description={ux.onerilen12006301} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextRow name="twitterHandle" label={ux.xTwitterKullaniciAdi} value={g.twitterHandle} onChange={(v) => setG({ twitterHandle: v })} error={errors.twitterHandle} placeholder="@qratex" />
                    <Field id="seo-twitterCard" label={ux.xKartTipi} error={errors.twitterCard}>
                      {(c) => (
                        <select {...c} value={g.twitterCard} onChange={(e) => setG({ twitterCard: e.target.value as DraftGlobal['twitterCard'] })} className="min-h-11 w-full rounded-control border border-border bg-surface-1 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-10">
                          <option value="summary_large_image">{sx.cardLarge}</option>
                          <option value="summary">{sx.cardSmall}</option>
                        </select>
                      )}
                    </Field>
                  </div>
                  <ExternalTools base={base} kind="social" />
                </>
              ) : null}

              {active === 'yapisal' ? (
                <>
                  <TextRow name="organizationName" label={ux.kurulusAdi} required value={g.organizationName} onChange={(v) => setG({ organizationName: v })} error={errors.organizationName} />
                  <TextRow name="organizationDescription" label={ux.kurulusAciklamasi} multiline value={g.organizationDescription} onChange={(v) => setG({ organizationDescription: v })} error={errors.organizationDescription} />
                  <TextRow name="websiteDescription" label={ux.webSitesiAciklamasi} multiline value={g.websiteDescription} onChange={(v) => setG({ websiteDescription: v })} error={errors.websiteDescription} />
                  <div>
                    <p className="mb-1 text-sm font-medium text-fg">{sx.jsonLd}</p>
                    <pre className="max-h-72 overflow-auto rounded-control border border-border bg-surface-2 p-3 text-xs text-fg" tabIndex={0} aria-label={ux.jsonLdOnizlemesi}>
                      {JSON.stringify(
                        {
                          '@context': 'https://schema.org',
                          '@graph': [
                            { '@type': 'Organization', name: g.organizationName, url: base, logo: `${base}/logo/logo.png`, description: g.organizationDescription },
                            { '@type': 'WebSite', name: g.siteName, url: base, description: g.websiteDescription, inLanguage: 'tr-TR' },
                          ],
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  <ExternalTools base={base} kind="rich" />
                </>
              ) : null}

              {active === 'tarama' ? (
                <>
                  {saved.demoSite ? (
                    <p className={cn('rounded-card border p-3 text-sm', TONE_CALLOUT.info)}>
                      {ux.buOrtamDemoSitesi}
                    </p>
                  ) : null}
                  <DangerSwitch id="seo-robotsIndex" label={ux.aramaMotorlariSiteyiIndeksleyebilir} description={ux.kapatmakTumSiteyeNoindex} checked={g.robotsIndex} onChange={(v) => setG({ robotsIndex: v })} />
                  <DangerSwitch id="seo-robotsFollow" label={ux.baglantilarIzlenebilirFollow} description={ux.kapatmakNofollowEklerArama} checked={g.robotsFollow} onChange={(v) => setG({ robotsFollow: v })} />
                  <PathListEditor value={g.robotsDisallow} onChange={(v) => setG({ robotsDisallow: v })} error={errors.robotsDisallow ?? Object.entries(errors).find(([k]) => k.startsWith('robotsDisallow'))?.[1]} />
                  {g.robotsDisallow.length === 0 ? <p className="text-xs text-fg-muted">{fz.emptyDisallow(DEFAULT_DISALLOW.join(', '))}</p> : null}
                  <div>
                    <p className="mb-1 text-sm font-medium text-fg">{sx.robotsTxt}</p>
                    <pre className="overflow-auto rounded-control border border-border bg-surface-2 p-3 font-mono text-xs text-fg" tabIndex={0} aria-label={ux.robotsTxtOnizlemesi}>
                      {renderRobotsTxt({ ...saved.payload.global, ...(validation.ok ? validation.data.global : {}), robotsDisallow: g.robotsDisallow.filter((x) => x.trim()), sitemapEnabled: g.sitemapEnabled }, { demo: saved.demoSite, base })}
                    </pre>
                  </div>
                  <DangerSwitch id="seo-sitemapEnabled" label={ux.sitemapYayinda} description={ux.kapatmakSitemapXmlI} checked={g.sitemapEnabled} onChange={(v) => setG({ sitemapEnabled: v })} />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-fg">Ek sitemap adresleri</p>
                    <p className="text-xs text-fg-muted">{sx.sitemapAuto}</p>
                    <SitemapRows rows={g.extraSitemapUrls} onChange={(rows) => setG({ extraSitemapUrls: rows })} errors={errors} />
                  </div>
                </>
              ) : null}

              {active === 'sayfalar' ? (
                <>
                  <p className="text-sm text-fg-muted">
                    {ux.yalnizAsagidakiSayfalarEzmeyi}
                  </p>
                  <OverrideRows rows={draft.pageOverrides} onChange={(rows) => setDraft((d) => ({ ...d, pageOverrides: rows }))} errors={errors} onFocusRow={setFocusPath} />
                </>
              ) : null}
            </div>
          )}
        </SectionTabs>
      </div>

      <DirtyBar
        dirty={dirty}
        saving={persist.isPending}
        onSave={onSave}
        onDiscard={() => { setDraft(toDraft(saved.payload)); setSubmitted(false); }}
        conflict={conflict ? { onReload: reloadLatest } : null}
        message={submitted && !validation.ok ? `${Object.keys(validation.errors).length} alanda hata var` : undefined}
      />

      <SeoHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} dirty={dirty} onRestore={(e) => restore(e)} />

      <ConfirmAction
        open={!!danger}
        onOpenChange={(o) => { if (!o) setDanger(null); }}
        tone="danger"
        title={ux.aramaGorunurlugunuDusurenDegisiklik}
        description={ux.buDegisiklikKaydedilirse}
        impact={{ items: (danger?.flags ?? []).map((f) => ({ label: '•', value: f.message, emphasis: true })) }}
        confirmPhrase={fz.dangerPhrase}
        confirmLabel={ux.anladimKaydet}
        irreversibleNote={ux.geriAlmakMumkunAma}
        onConfirm={async () => {
          const run = danger?.run;
          setDanger(null);
          if (run) await run();
        }}
      />
    </PanelPage>
  );
}

function DangerSwitch({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn('flex min-h-11 items-start justify-between gap-4 rounded-card border p-3', checked ? 'border-border' : 'border-danger-border bg-danger-subtle')}>
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
        <p id={`${id}-desc`} className="text-xs text-fg-muted">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-desc`} />
    </div>
  );
}

function StatusStrip({ saved, health, onHistory }: { saved: SeoState; health: HealthReport | null; onHistory: () => void }) {
  const fz = useSeoCopy().fx;
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const g = saved.payload.global;
  const indexable = g.robotsIndex && !g.robotsDisallow.some((p) => p.trim() === '/') && !saved.demoSite;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={cn('rounded-card border p-3', indexable ? TONE_CALLOUT.success : TONE_CALLOUT.danger)}>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{sx.indexing}</p>
        <p className="mt-1 flex items-center gap-1.5 font-semibold text-fg">
          {indexable ? <Globe className="h-4 w-4 text-success" aria-hidden /> : <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />}
          {indexable ? ux.yayindaIndekslenebilir : saved.demoSite ? ux.demoOrtamiEngelli : ux.aramaMotorlarinaKapali}
        </p>
      </div>
      <div className="rounded-card border border-border bg-surface-1 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{sx.healthScore}</p>
        <p className="mt-1 font-semibold text-fg">{health ? <ScoreText score={health.score} /> : ux.henuzKontrolEdilmedi}</p>
        {health ? <p className="text-xs text-fg-subtle">{relTime(health.checkedAt)}{health.checkedBy ? ` · ${health.checkedBy}` : ''}</p> : null}
      </div>
      <button type="button" onClick={onHistory} className="rounded-card border border-border bg-surface-1 p-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{sx.lastChange}</p>
        <p className="mt-1 font-semibold text-fg">{saved.lastChange ? relTime(saved.lastChange.at) : ux.hicKaydedilmediVarsayilanlar}</p>
        {saved.lastChange?.actor ? <p className="text-xs text-fg-subtle">{saved.lastChange.actor} · {fz.seeHistory}</p> : null}
      </button>
    </div>
  );
}

function ScoreText({ score }: { score: number }) {
  const shown = useNumberTicker(score);
  return (
    <span className={cn('tabular-nums', score >= 85 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-danger')}>
      {Math.round(shown)}/100
    </span>
  );
}

const SEV_LABEL: Record<HealthCheck['severity'], string> = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' };
const SEV_TONE = { critical: 'danger', warning: 'warning', info: 'info' } as const;

function HealthPanel({ report, running, dirty, onRun, onFix }: { report: HealthReport | null; running: boolean; dirty: boolean; onRun: () => void; onFix: (c: HealthCheck) => void }) {
  const fz = useSeoCopy().fx;
  const L = useSourceT(SEO_DICT);
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const [onlyFailed, setOnlyFailed] = useState(true);
  const reduced = useReducedMotionPref();
  const checks = useMemo(() => {
    const order = { critical: 0, warning: 1, info: 2 };
    const list = [...(report?.checks ?? [])].sort((a, b) => Number(a.passed) - Number(b.passed) || order[a.severity] - order[b.severity]);
    return onlyFailed ? list.filter((c) => !c.passed) : list;
  }, [report, onlyFailed]);
  return (
    <section aria-labelledby="seo-health-title" className="rounded-card border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="seo-health-title" className="font-semibold text-fg">{sx.healthCheck}</h2>
          <p className="text-xs text-fg-muted">
            {report ? fz.healthSummary(report.passedCount, report.failedCount, fmtAbs(report.checkedAt)) : ux.kayitliAyarlariVeCanli}
            {dirty ? ux.kaydedilmemisDegisikliklerDenetlenmez : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {report ? (
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <Switch checked={onlyFailed} onCheckedChange={setOnlyFailed} aria-label={ux.yalnizSorunlariGoster} />
              {ux.yalnizSorunlar}
            </label>
          ) : null}
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={onRun} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {running ? 'Kontrol ediliyor…' : ux.kontrolleriCalistir}
          </Button>
        </div>
      </div>
      {report ? (
        checks.length ? (
          <ul className="mt-3 divide-y divide-border">
            {checks.map((c) => (
              <Motion.li key={c.key} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-start gap-2">
                  {!c.tested ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-label={ux.testEdilmedi} />
                  ) : c.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label={ux.gecti} />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label={ux.sorun} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{c.label}</p>
                    <p className="break-words text-xs text-fg-muted">{c.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge size="sm" label={c.tested ? L(SEV_LABEL[c.severity]) : fz.notTested} tone={c.tested ? SEV_TONE[c.severity] : 'neutral'} />
                  {!c.passed && c.fix ? (
                    <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => onFix(c)}>
                      <Wrench className="h-3.5 w-3.5" aria-hidden /> {ux.duzelt}
                    </Button>
                  ) : null}
                </div>
              </Motion.li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> Sorun yok.</p>
        )
      ) : null}
    </section>
  );
}

function ExternalTools({ base, kind }: { base: string; kind: 'social' | 'rich' }) {
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const u = encodeURIComponent(base);
  const links =
    kind === 'rich'
      ? [{ href: `https://search.google.com/test/rich-results?url=${u}`, label: ux.googleZenginSonuclarTesti }, { href: `https://validator.schema.org/#url=${u}`, label: ux.schemaOrgDogrulayici }]
      : [{ href: `https://developers.facebook.com/tools/debug/?q=${u}`, label: ux.facebookPaylasimHataAyiklayici }, { href: `https://www.linkedin.com/post-inspector/inspect/${u}`, label: ux.linkedinPostInspector }];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <Button key={l.href} asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <a href={l.href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden /> {l.label}<span className="sr-only">{sx.newTabSite}</span>
          </a>
        </Button>
      ))}
    </div>
  );
}

/** Kayıtlı ayarları dışa aktarır; içe aktarma şemayla doğrulanır, fark önizlenir, yalnız TASLAĞA uygulanır. */
function ImportExport({ saved, onApply }: { saved: SeoPayload; onApply: (p: SeoPayload) => void }) {
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ payload: SeoPayload | null; errors: Array<{ path: string; message: string }> } | null>(null);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ kind: 'qratex-seo', exportedAt: new Date().toISOString(), ...saved }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seo-ayarlari-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) {
      toast.error(ux.dosyaCokBuyukEn);
      return;
    }
    try {
      const raw = JSON.parse(await f.text()) as Record<string, unknown>;
      const r = parseSeoPayload({ global: raw.global, pageOverrides: raw.pageOverrides ?? [] });
      setPending(r.ok ? { payload: r.data, errors: [] } : { payload: null, errors: r.errors });
    } catch {
      setPending({ payload: null, errors: [{ path: 'dosya', message: ux.gecerliBirJsonDosyasi }] });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const changes = pending?.payload ? diffSeoPayload(saved, pending.payload) : [];
  return (
    <>
      <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={exportJson}>
        <Download className="h-4 w-4" aria-hidden /> {ux.disaAktar}
      </Button>
      <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" aria-hidden /> {ux.iceAktar}
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileJson className="h-5 w-5" aria-hidden /> {sx.importPreview}</DialogTitle>
            <DialogDescription>
              {pending?.payload ? ux.degisikliklerTaslagaUygulanirKaydedene : ux.dosyaDogrulamadanGecemediHicbir}
            </DialogDescription>
          </DialogHeader>
          {pending?.errors.length ? (
            <ul className="space-y-1 text-sm">
              {pending.errors.slice(0, 20).map((e, i) => <li key={i} className="text-danger"><span className="font-mono text-xs">{e.path}</span>: {e.message}</li>)}
            </ul>
          ) : changes.length ? (
            <dl className="space-y-1.5 text-sm">
              {changes.map((c) => (
                <div key={c.key} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2">
                  <dt className="text-fg-muted">{c.label}</dt>
                  <dd className="break-words"><span className="text-fg-subtle line-through">{c.before}</span> → {c.after}</dd>
                </div>
              ))}
            </dl>
          ) : pending?.payload ? (
            <p className="text-sm text-fg-muted">{sx.importSame}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>{sx.cancel}</Button>
            {pending?.payload && changes.length ? (
              <Button onClick={() => { onApply(pending.payload as SeoPayload); setPending(null); toast.message(ux.taslagaUygulandiKontrolEdip); }}>
                {ux.taslagaUygula}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

