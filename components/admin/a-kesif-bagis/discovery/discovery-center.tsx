'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Compass, Download, FileJson, History, LayoutDashboard, MapPinned, Megaphone, MoreHorizontal, RefreshCw, Trophy, Upload, View } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DirtyBar } from '@/components/ds/form';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { ConfirmAction, ErrorState, InlineError, SkeletonCards, SkeletonStats } from '@/components/states';
import { TONE_CALLOUT } from '@/components/states/tone';
import {
  discoveryConfigSchema,
  issuePathLabel,
  sponsorStatus,
  type DealerRef,
  type DiscoveryConfigValue,
  type DiscoveryState,
} from '@/lib/admin-discovery/contract';
import { cn } from '@/lib/utils';
import { discoveryKeys, errorText, fetchDiscovery, isConflict, saveDiscovery } from '../api';
import { CoverageTab, type CoverageInitial } from './coverage-tab';
import { SponsoredTab } from './sponsored-tab';
import { LocationsTab } from './locations-tab';
import { WeeklyTab } from './weekly-tab';
import { ImportDialog } from './import-dialog';

// Önizleme ve geçmiş yalnız sekmesi açılınca yüklenir.
const PreviewTab = dynamic(() => import('./preview-tab'), { ssr: false, loading: () => <SkeletonCards /> });
const HistoryTab = dynamic(() => import('./history-tab'), { ssr: false, loading: () => <SkeletonCards /> });

// ───────────────────────────── Taslak bağlamı ─────────────────────────────

type DraftCtx = {
  draft: DiscoveryConfigValue;
  update: (fn: (d: DiscoveryConfigValue) => DiscoveryConfigValue) => void;
  dealers: Record<string, DealerRef>;
  rememberDealer: (d: DealerRef) => void;
  /** Kayıtlı (yayındaki) değer — "yayında" ile "taslak" ayrımı için. */
  published: DiscoveryConfigValue;
};
const Ctx = createContext<DraftCtx | null>(null);
export function useDiscoveryDraft(): DraftCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDiscoveryDraft yalnız DiscoveryCenter içinde kullanılır.');
  return v;
}

const sig = (c: DiscoveryConfigValue) => JSON.stringify(c);

export type DiscoveryInitial = { state: DiscoveryState | null; coverage: CoverageInitial };

/**
 * Admin → Keşif ve sponsorlu (/admin/discovery).
 *
 * Yükleme hatasında form HİÇ açılmaz (rapor Bulgu 1); düzenlemeler tek bir taslakta toplanır ve
 * alttaki değişiklik çubuğuyla bilinçli olarak yayınlanır (C2: `baseVersion`, çakışmada 409 →
 * "güncel hali yükle"). Sayfadan ayrılırken kaydedilmemiş değişiklik uyarısı DirtyBar'dadır.
 */
export function DiscoveryCenter({ initial }: { initial: DiscoveryInitial }) {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: discoveryKeys.state(), queryFn: fetchDiscovery, initialData: initial.state ?? undefined, staleTime: Infinity, refetchOnWindowFocus: false });
  const [nonce, setNonce] = useState(0);

  if (state.isPending) {
    return (
      <PanelPage register="ops" header={<Header />}>
        <SkeletonStats />
        <SkeletonCards />
      </PanelPage>
    );
  }
  if (state.isError || !state.data) {
    return (
      <PanelPage register="ops" header={<Header />}>
        <ErrorState
          title="Keşif ayarları yüklenemedi"
          description={`${errorText(state.error)} Ayarlar yüklenmeden düzenleme açılmaz; böylece canlı ayar boş bir taslakla ezilemez.`}
          onRetry={() => state.refetch()}
        />
      </PanelPage>
    );
  }
  return (
    <Editor
      key={`${state.data.version}:${nonce}`}
      state={state.data}
      coverage={initial.coverage}
      onReloaded={(s) => {
        qc.setQueryData(discoveryKeys.state(), s);
        setNonce((n) => n + 1);
      }}
    />
  );
}

function Header({ actions }: { actions?: ReactNode }) {
  return (
    <PageHeader
      title="Keşif ve sponsorlu"
      description="Keşfet’in veri kapsamını izleyin, sponsorlu duyuruları planlayın, profili eksik işletmelere yedek konum verin ve müşterinin göreceğini yayınlamadan önce önizleyin."
      icon={<Compass />}
      actions={actions}
    />
  );
}

function Editor({ state, coverage, onReloaded }: { state: DiscoveryState; coverage: CoverageInitial; onReloaded: (s: DiscoveryState) => void }) {
  const qc = useQueryClient();
  const [published, setPublished] = useState<{ config: DiscoveryConfigValue; version: string }>({ config: state.config, version: state.version });
  const [draft, setDraft] = useState<DiscoveryConfigValue>(state.config);
  const [dealers, setDealers] = useState<Record<string, DealerRef>>(state.dealers);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState<string | undefined>(undefined);
  const dirty = useMemo(() => sig(draft) !== sig(published.config), [draft, published.config]);

  const update = useCallback((fn: (d: DiscoveryConfigValue) => DiscoveryConfigValue) => {
    setDraft((d) => fn(d));
    setIssues([]);
    setSaveError(null);
  }, []);
  const rememberDealer = useCallback((d: DealerRef) => setDealers((m) => (m[d.id] ? m : { ...m, [d.id]: d })), []);

  const save = async () => {
    const parsed = discoveryConfigSchema.safeParse(draft);
    if (!parsed.success) {
      setIssues(parsed.error.issues.slice(0, 8).map((i) => `${issuePathLabel(i.path)}: ${i.message}`));
      toast.error('Taslakta düzeltilmesi gereken alanlar var.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveDiscovery(parsed.data, published.version, restoredFrom);
      setPublished({ config: saved.config, version: saved.version });
      setDraft(saved.config);
      setDealers((m) => ({ ...m, ...saved.dealers }));
      setRestoredFrom(undefined);
      qc.setQueryData(discoveryKeys.state(), { ...state, config: saved.config, version: saved.version, dealers: { ...dealers, ...saved.dealers }, isDefault: false });
      await qc.invalidateQueries({ queryKey: ['admin-discovery', 'coverage'] });
      await qc.invalidateQueries({ queryKey: ['admin-discovery', 'history'] });
      toast.success('Keşif ayarları yayınlandı.');
    } catch (e) {
      if (isConflict(e)) setConflict(true);
      else setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const reloadLatest = async () => {
    const fresh = await fetchDiscovery();
    onReloaded(fresh);
  };

  // Taslağı geçmişten/içe aktarmadan yükle.
  const loadIntoDraft = (config: DiscoveryConfigValue, from?: string) => {
    setDraft(config);
    setRestoredFrom(from);
    setIssues([]);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kesif-ayari-${dirty ? 'taslak' : 'yayinda'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const now = new Date();
  const liveCount = draft.sponsored.filter((s) => sponsorStatus(s, now) === 'live').length;
  const ctx = useMemo<DraftCtx>(() => ({ draft, update, dealers, rememberDealer, published: published.config }), [draft, update, dealers, rememberDealer, published.config]);

  // Sayfa içi gezinmede kirli taslak uyarısı (DirtyBar sekme kapatmayı zaten uyarır).
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm('Kaydedilmemiş keşif değişiklikleri var. Sayfadan ayrılırsanız kaybolacak. Devam edilsin mi?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <Ctx.Provider value={ctx}>
      <PanelPage
        register="ops"
        header={
          <Header
            actions={
              <div className="flex flex-wrap gap-2">
                {dirty ? (
                  <ConfirmAction
                    tone="warning"
                    title="Taslak atılıp yayındaki ayar yeniden yüklensin mi?"
                    description="Kaydedilmemiş değişiklikleriniz silinir."
                    irreversibleNote={false}
                    confirmLabel="Yeniden yükle"
                    trigger={
                      <Button variant="outline" className="min-h-11 sm:min-h-10">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        Yenile
                      </Button>
                    }
                    onConfirm={reloadLatest}
                  />
                ) : (
                  <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => reloadLatest().then(() => qc.invalidateQueries({ queryKey: discoveryKeys.all })).catch((e) => toast.error(errorText(e)))}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Yenile
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-h-11 sm:min-h-10" aria-label="Diğer işlemler">
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={exportJson}>
                      <Download className="h-4 w-4" aria-hidden />
                      {dirty ? 'Taslağı JSON indir' : 'Ayarı JSON indir'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                      <Upload className="h-4 w-4" aria-hidden />
                      JSON’dan taslağa al
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin/modules">
                        <FileJson className="h-4 w-4" aria-hidden />
                        Modül ayarları
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />
        }
      >
        {!state.moduleEnabled ? (
          <div role="status" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.warning)}>
            Keşif modülü müşteriler için kapalı; burada yaptığınız değişiklikler modül açılana kadar müşteriye görünmez.{' '}
            <Link href="/admin/modules" className="font-medium underline underline-offset-2">
              Modülü yönet
            </Link>
          </div>
        ) : null}
        {state.droppedRows > 0 ? (
          <div role="status" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.info)}>
            Kayıtlı ayarda işletmesi ya da başlığı olmayan {state.droppedRows} satır okunamadı; müşteriye zaten gösterilmiyordu ve bir sonraki yayında kaldırılacak.
          </div>
        ) : null}
        {restoredFrom ? (
          <div role="status" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.brand)}>
            Taslak geçmişteki bir sürümden yüklendi. Yayınlamak için alttaki çubuktan kaydedin; vazgeçmek için “Geri al”.
          </div>
        ) : null}
        {issues.length > 0 ? (
          <InlineError variant="banner">
            <span className="font-medium">Yayınlamadan önce düzeltin:</span>
            <ul className="mt-1 list-disc pl-5">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </InlineError>
        ) : null}

        <SectionTabs
          ariaLabel="Keşif bölümleri"
          defaultValue="genel"
          resetKeys={['page', 'filter', 'q', 'sponsor', 'konum']}
          tabs={[
            { value: 'genel', label: 'Kapsama', icon: <LayoutDashboard /> },
            { value: 'sponsorlu', label: 'Sponsorlu', icon: <Megaphone />, count: liveCount || undefined },
            { value: 'konumlar', label: 'Yedek konumlar', icon: <MapPinned />, count: draft.locations.length || undefined },
            { value: 'enler', label: 'Haftanın enleri', icon: <Trophy /> },
            { value: 'onizleme', label: 'Önizleme', icon: <View /> },
            { value: 'gecmis', label: 'Geçmiş', icon: <History /> },
          ]}
        >
          {(tab) =>
            tab === 'sponsorlu' ? (
              <SponsoredTab />
            ) : tab === 'konumlar' ? (
              <LocationsTab />
            ) : tab === 'enler' ? (
              <WeeklyTab />
            ) : tab === 'onizleme' ? (
              <PreviewTab dirty={dirty} />
            ) : tab === 'gecmis' ? (
              <HistoryTab currentVersion={published.version} dirty={dirty} onLoad={loadIntoDraft} />
            ) : (
              <CoverageTab initial={coverage} />
            )
          }
        </SectionTabs>
        <div className="h-20" aria-hidden />
      </PanelPage>

      <DirtyBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={() => {
          setDraft(published.config);
          setRestoredFrom(undefined);
          setIssues([]);
          setSaveError(null);
        }}
        conflict={
          conflict
            ? {
                message: 'Keşif ayarları siz düzenlerken başka bir yönetici tarafından değiştirildi. Güncel hali yükleyin (taslağınız silinir) ya da önce taslağı JSON olarak indirin.',
                onReload: () => {
                  setConflict(false);
                  return reloadLatest();
                },
              }
            : null
        }
        error={saveError}
        message="Yayınlanmamış keşif değişiklikleri var"
        saveLabel="Yayınla"
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={(c) => loadIntoDraft(c)} />
    </Ctx.Provider>
  );
}
