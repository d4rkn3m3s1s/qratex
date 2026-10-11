'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, ClipboardCopy, Monitor, Moon, Palette, RotateCcw, Sun, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmAction, QueryState, SectionCard, InlineError } from '@/components/states';
import { SectionTabs } from '@/components/ds/page';
import { fadeUp } from '@/lib/motion';
import {
  DEFAULT_DRAFT,
  DEFAULT_MODE_LABEL,
  DEFAULT_MODES,
  defaultCustomColors,
  describeDraft,
  draftContrastReport,
  draftFromSnapshot,
  draftToCss,
  draftsEqual,
  paletteFor,
  type CustomColors,
  type DefaultMode,
  type ThemeDraft,
} from '@/lib/design-system/theme-model';
import type { ThemeOverview } from '@/lib/design-system/theme.server';
import { broadcastPublished, dsKeys, errorText, fetchTheme, formatIstanbul, isConflict, publishTheme, type PublishResult } from '../api';
import { FamilyPicker } from './family-picker';
import { ColorField } from './color-field';
import { PreviewCanvas } from './preview-canvas';
import { HistoryList } from './history-list';

const MODE_ICON: Record<DefaultMode, React.ReactNode> = {
  system: <Monitor className="h-4 w-4" aria-hidden />,
  light: <Sun className="h-4 w-4" aria-hidden />,
  dark: <Moon className="h-4 w-4" aria-hidden />,
};

function LiveSwatches({ draft }: { draft: Pick<ThemeDraft, 'activeTheme' | 'customColors'> }) {
  const rows = (['light', 'dark'] as const).map((mode) => ({ mode, p: paletteFor(draft, mode) }));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(({ mode, p }) => (
        <div key={mode} className="min-w-0 space-y-1">
          <p className="qx-caption text-fg-muted">{mode === 'dark' ? 'Koyu mod' : 'Açık mod'}</p>
          <ul className="grid grid-cols-5 gap-1.5">
            {[
              { k: 'Birincil', v: p.primary },
              { k: 'İkincil', v: p.secondary },
              { k: 'Vurgu', v: p.accent },
              { k: 'Zemin', v: p.background },
              { k: 'Metin', v: p.foreground },
            ].map((s) => (
              <li key={s.k} className="min-w-0 space-y-0.5 text-center">
                <span
                  aria-hidden
                  className="block aspect-square w-full rounded-control border border-strong/30"
                  style={{ background: s.v ?? undefined, backgroundImage: s.v ? undefined : 'repeating-linear-gradient(45deg,transparent 0 4px,hsl(var(--border)) 4px 5px)' }}
                />
                <span className="qx-caption block truncate text-fg-muted">{s.k}</span>
                <span className="qx-caption block truncate font-mono text-fg-subtle">{s.v ?? 'varsayılan'}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ModeControl({ value, onChange }: { value: DefaultMode; onChange: (m: DefaultMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Platform varsayılan modu" className="inline-flex rounded-control bg-surface-muted p-1">
      {DEFAULT_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn(
            'qx-small inline-flex min-h-11 items-center gap-1.5 rounded-chip px-3 font-medium transition-colors duration-fast sm:min-h-9',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === m ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg',
          )}
        >
          {MODE_ICON[m]}
          {DEFAULT_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

function CustomEditor({ value, onChange }: { value: CustomColors; onChange: (c: CustomColors) => void }) {
  const set = (patch: Partial<CustomColors>) => onChange({ ...value, ...patch });
  const setSurface = (mode: 'light' | 'dark', patch: { background?: string; foreground?: string } | null) => {
    const modes = { ...(value.modes ?? {}) };
    if (patch === null) delete modes[mode];
    else modes[mode] = { ...(modes[mode] ?? {}), ...patch } as { background?: string; foreground?: string };
    onChange({ ...value, modes: modes.light || modes.dark ? modes : undefined });
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <ColorField label="Birincil" hint="Butonlar, bağlantılar, odak" value={value.primary} onChange={(v) => set({ primary: v })} />
        <ColorField label="İkincil" hint="İkincil buton, kenar çubuğu vurgusu" value={value.secondary} onChange={(v) => set({ secondary: v })} />
        <ColorField label="Vurgu" hint="Rozet ve vurgu yüzeyleri" value={value.accent} onChange={(v) => set({ accent: v })} />
      </div>
      {(['light', 'dark'] as const).map((mode) => {
        const s = value.modes?.[mode];
        const label = mode === 'dark' ? 'Koyu mod zemini' : 'Açık mod zemini';
        return (
          <fieldset key={mode} className="space-y-3 rounded-card border p-3">
            <legend className="qx-small px-1 font-medium text-fg">{label}</legend>
            {s ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField label="Zemin" value={s.background ?? '#FFFFFF'} onChange={(v) => setSurface(mode, { background: v })} />
                  <ColorField label="Metin" value={s.foreground ?? '#111111'} onChange={(v) => setSurface(mode, { foreground: v })} />
                </div>
                <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setSurface(mode, null)}>
                  Platform varsayılan zeminine dön
                </Button>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="qx-caption text-fg-muted">Platformun varsayılan zemini ve metni kullanılır (önerilen).</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => setSurface(mode, mode === 'dark' ? { background: '#0B0B14', foreground: '#F1F5F9' } : { background: '#FAFAFC', foreground: '#1E1B4B' })}
                >
                  Özel zemin tanımla
                </Button>
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} panoya kopyalandı.`);
  } catch {
    toast.error('Pano erişimi reddedildi; tarayıcı izinlerini kontrol edin.');
  }
}

/**
 * Temalar: canlıdaki tema → taslak (yalnız bu ekranda önizlenir) → kontrast raporu + onayla yayın.
 * Belge köküne hiçbir şey yazılmaz; yayın sonrası sağlayıcı yanıttaki satırlarla güncellenir.
 */
export function ThemeStudio({ initial }: { initial: ThemeOverview | null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: dsKeys.theme, queryFn: ({ signal }) => fetchTheme(signal), initialData: initial ?? undefined, staleTime: 30_000 });
  const live = q.data;
  const liveDraft = useMemo(() => (live ? draftFromSnapshot(live.snapshot) : null), [live]);
  const [draft, setDraft] = useState<ThemeDraft | null>(null);
  const [tab, setTab] = useState<'preset' | 'custom'>('preset');
  const [note, setNote] = useState('');
  const [conflict, setConflict] = useState(false);

  // Canlı veri gelince (ya da tazelenince) taslağı yalnız kullanıcı henüz düzenlemediyse eşitle.
  useEffect(() => {
    if (!liveDraft) return;
    setDraft((d) => d ?? liveDraft);
    setTab((t) => (liveDraft.activeTheme === 'custom' ? 'custom' : t));
  }, [liveDraft]);

  const dirty = !!(draft && liveDraft && (!draftsEqual(draft, liveDraft) || !live?.valid));
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const report = useMemo(() => (draft ? draftContrastReport(draft) : null), [draft]);

  const afterWrite = async (r: PublishResult) => {
    broadcastPublished(r.entries);
    const fresh = await qc.fetchQuery({ queryKey: dsKeys.theme, queryFn: ({ signal }) => fetchTheme(signal), staleTime: 0 });
    setDraft(draftFromSnapshot(fresh.snapshot));
    setNote('');
    setConflict(false);
    void qc.invalidateQueries({ queryKey: ['admin-design-system', 'theme-history'] });
  };

  const reloadLatest = async () => {
    const r = await q.refetch();
    if (r.data) setDraft(draftFromSnapshot(r.data.snapshot));
    setConflict(false);
  };

  return (
    <QueryState query={q} skeleton="detail">
      {(data) => {
        if (!draft) return null;
        const custom = draft.customColors ?? defaultCustomColors();
        return (
          <div className="flex flex-col gap-section">
            <SectionCard
              title="Canlıdaki tema"
              icon={<Palette />}
              description={
                data.lastPublished
                  ? `Son yayın: ${formatIstanbul(data.lastPublished.at)} · ${data.lastPublished.actor ?? 'Bilinmeyen yönetici'}`
                  : 'Bu ekrandan henüz yayın yapılmadı (önceki değişiklikler eski tema sayfasından).'
              }
              actions={
                <span className="qx-small font-semibold text-fg">
                  {describeDraft(data.snapshot)} · {DEFAULT_MODE_LABEL[data.snapshot.defaultMode]}
                </span>
              }
            >
              <div className="space-y-4">
                {!data.valid && (
                  <div role="alert" className="qx-small flex gap-2 rounded-control border border-warning-border bg-warning-subtle p-3 text-fg">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <span>
                      Saklı değer geçerli bir tema değil ({describeDraft(data.snapshot)}). Ziyaretçiler şu an platformun CSS varsayılan paletini görüyor
                      olabilir. Aşağıdan bir tema seçip yayınlayarak düzeltin.
                    </span>
                  </div>
                )}
                {data.valid && <LiveSwatches draft={{ activeTheme: data.snapshot.activeTheme as string, customColors: data.snapshot.customColors }} />}
                {data.seasonal && (
                  <div role="status" className="qx-small flex flex-wrap items-center gap-2 rounded-control border border-info-border bg-info-subtle p-3 text-fg">
                    <CalendarClock className="h-4 w-4 shrink-0 text-info" aria-hidden />
                    <span className="min-w-0 flex-1">
                      “{data.seasonal.name}” dönemsel konsepti etkin: {formatIstanbul(data.seasonal.endDate, { dateStyle: 'long' })} tarihine kadar kullanıcılar
                      {data.seasonal.familyName ? ` “${data.seasonal.familyName}”` : ' konseptin'} paletini görür; burada yayınlanan tema konsept bitince görünür.
                    </span>
                    <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                      <Link href="/admin/campaigns-calendar">Konsepte git</Link>
                    </Button>
                  </div>
                )}
                {data.seasonalUnknown && (
                  <p className="qx-caption text-fg-muted">Dönemsel konsept durumu okunamadı; bir konsept paleti bu temayı geçici olarak ezebilir.</p>
                )}
              </div>
            </SectionCard>

            <div className="grid gap-section lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
              <div className="flex min-w-0 flex-col gap-section">
                <SectionCard
                  title="Varsayılan mod"
                  description="Kendi seçimini yapmamış ziyaretçilerin açık/koyu modu. Kullanıcının kendi tercihi her zaman önce gelir."
                >
                  <ModeControl value={draft.defaultMode} onChange={(m) => setDraft({ ...draft, defaultMode: m })} />
                </SectionCard>

                <SectionCard title="Palet" description="Seçim yalnız bu ekrandaki önizlemeyi değiştirir. Yayına almak için alttaki “Yayınla” adımı gerekir.">
                  <SectionTabs
                    variant="pill"
                    value={tab}
                    onValueChange={(v) => {
                      const next = v as 'preset' | 'custom';
                      setTab(next);
                      if (next === 'custom') setDraft({ ...draft, activeTheme: 'custom', customColors: custom });
                      else if (draft.activeTheme === 'custom') setDraft({ ...draft, activeTheme: liveDraft && liveDraft.activeTheme !== 'custom' ? liveDraft.activeTheme : DEFAULT_DRAFT.activeTheme });
                    }}
                    ariaLabel="Palet türü"
                    tabs={[
                      { value: 'preset', label: 'Hazır paletler' },
                      { value: 'custom', label: 'Özel' },
                    ]}
                  >
                    {(active) =>
                      active === 'preset' ? (
                        <FamilyPicker value={draft.activeTheme} onChange={(id) => setDraft({ ...draft, activeTheme: id })} />
                      ) : (
                        <CustomEditor value={custom} onChange={(c) => setDraft({ ...draft, activeTheme: 'custom', customColors: c })} />
                      )
                    }
                  </SectionTabs>
                </SectionCard>

                <SectionCard title="Dışa aktar" description="Taslağın çalışma zamanında yazılacak CSS değişkenleri ya da kayıt biçimi.">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => void copy(draftToCss(draft), 'CSS değişkenleri')}>
                      <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> CSS'i kopyala
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => void copy(JSON.stringify(draft, null, 2), 'Tema JSON')}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> JSON'u kopyala
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => {
                        setDraft({ ...DEFAULT_DRAFT, customColors: draft.customColors });
                        setTab('preset');
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Taslağı varsayılana sıfırla
                    </Button>
                  </div>
                </SectionCard>
              </div>

              <div className="min-w-0 lg:sticky lg:top-20">
                <SectionCard
                  title="Önizleme"
                  description={`${describeDraft(draft)} · açık ve koyu mod yan yana. Yalnız bu tuval boyanır; platform değişmez.`}
                  tone={report && report.failing > 0 ? 'warning' : undefined}
                  stripe={!!report && report.failing > 0}
                >
                  <PreviewCanvas draft={draft} />
                </SectionCard>
              </div>
            </div>

            <HistoryList version={data.version} onRolledBack={afterWrite} />

            <AnimatePresence>
              {dirty && (
                <div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-sticky">
                  <Motion.div
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    role="region"
                    aria-label="Yayınlanmamış değişiklikler"
                    className="pointer-events-auto mx-auto flex max-w-4xl flex-col gap-3 rounded-card border bg-surface-1 p-3 qx-elevation-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="qx-small font-semibold text-fg">Yayınlanmamış değişiklik</p>
                      <p className="qx-caption text-fg-muted">
                        {describeDraft(draft)} · {DEFAULT_MODE_LABEL[draft.defaultMode]}
                        {report && report.failing > 0 ? ` · ${report.failing} kontrast uyarısı` : ' · kontrast temiz'}
                      </p>
                      {conflict && (
                        <InlineError>
                          Tema bu arada değişti.{' '}
                          <button type="button" className="underline" onClick={() => void reloadLatest()}>
                            Güncel hâli yükle
                          </button>
                        </InlineError>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="ghost" className="min-h-11 sm:min-h-10" onClick={() => liveDraft && setDraft(liveDraft)} disabled={!live?.valid}>
                        Vazgeç
                      </Button>
                      <ConfirmAction
                        tone="brand"
                        trigger={
                          <Button type="button" className="min-h-11 sm:min-h-10">
                            <Upload className="h-4 w-4" aria-hidden /> Yayınla…
                          </Button>
                        }
                        title="Tema tüm kullanıcılara yayınlansın mı?"
                        description={
                          <span className="block space-y-3">
                            <span className="block">Müşteri, bayi, personel, yönetim ve landing arayüzleri bu palete geçer. Sürüm geçmişinden geri alınabilir.</span>
                            <span className="block space-y-1">
                              <label htmlFor="ds-theme-note" className="qx-small font-medium text-fg">
                                Not (isteğe bağlı)
                              </label>
                              <Textarea
                                id="ds-theme-note"
                                value={note}
                                maxLength={280}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Ör. Bahar kampanyası için marka mavisi"
                                rows={2}
                              />
                            </span>
                          </span>
                        }
                        impact={{
                          items: [
                            { label: 'Palet', value: describeDraft(draft), emphasis: true },
                            { label: 'Varsayılan mod', value: DEFAULT_MODE_LABEL[draft.defaultMode] },
                            { label: 'Kontrast uyarısı', value: report?.failing ?? 0, emphasis: (report?.failing ?? 0) > 0 },
                          ],
                          warning:
                            report && report.failing > 0
                              ? `${report.failing} renk çifti WCAG AA eşiğinin altında; bazı yazılar zor okunabilir. Önizlemedeki kırmızı rozetlere bakın.`
                              : undefined,
                        }}
                        confirmLabel="Yayınla"
                        onConfirm={async () => {
                          try {
                            const r = await publishTheme(draft, data.version, note.trim() || undefined);
                            await afterWrite(r);
                            toast.success('Tema yayınlandı.');
                          } catch (e) {
                            if (isConflict(e)) setConflict(true);
                            throw new Error(errorText(e));
                          }
                        }}
                      />
                    </div>
                  </Motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        );
      }}
    </QueryState>
  );
}
