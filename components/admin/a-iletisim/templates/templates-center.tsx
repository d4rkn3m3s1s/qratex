'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Eye,
  FlaskConical,
  Loader2,
  Mail,
  Plus,
  Save,
  Search,
  Send,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { INTERN_EMAIL_KINDS, type InternEmailKind } from '@/lib/intern-email-kinds';
import {
  newTemplateId,
  saveTemplatesSchema,
  sendLabelFor,
  splitRecipients,
  templateInputSchema,
  type TemplateInput,
  type TemplatesView,
} from '@/lib/mail-center/templates-contract';
import { MailApiError, errorText, fetchTemplatesView, saveTemplatesApi, sendTestApi, templateKeys } from '../api';
import { CommTabs } from '../comm-tabs';
import { fmtAgo, fmtDeadline, istanbulNowLocal } from '../format';
import { PreviewPane } from './preview-pane';
import { ResultsPanel } from './results-panel';
import { BulkSendDialog, SingleSendDialog } from './send-dialogs';
import { TemplateEditor } from './template-editor';
import { AdminIletisimText } from '../copy';

type Filter = 'active' | 'unsent' | 'sent' | 'error' | 'due' | 'archived';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Tümü' },
  { value: 'unsent', label: 'Gönderilmedi' },
  { value: 'sent', label: 'Gönderildi' },
  { value: 'error', label: 'Hatalı' },
  { value: 'due', label: 'Süresi yaklaşan' },
  { value: 'archived', label: 'Arşiv' },
];

const STARTER: Record<InternEmailKind, { subject: string; body: string }> = {
  task: {
    subject: 'QRateX — {{departman}} görevin',
    body: 'Merhaba {{isim}},\n\nMülakat sürecinin bir parçası olarak sana küçük bir görev hazırladık.\n\n1. Görev\n• Ne yapmanı istiyoruz\n• Nasıl teslim edeceğin\n\nSorun olursa bu maili yanıtlaman yeterli.',
  },
  general: { subject: 'QRateX', body: 'Merhaba {{isim}},\n\n' },
  welcome: { subject: 'QRateX ekibine hoş geldin!', body: 'Merhaba {{isim}},\n\nSeni ekibimizde görmekten mutluluk duyuyoruz.\n\n' },
  reminder: { subject: 'Hatırlatma — QRateX', body: 'Merhaba {{isim}},\n\nKüçük bir hatırlatma: \n\n' },
  minimal: { subject: 'QRateX', body: '' },
};

const TEST_TO_KEY = 'qx.mailTemplates.testTo';

function readUrlTemplate(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('t');
}
function writeUrlTemplate(id: string | null) {
  const qs = new URLSearchParams(window.location.search);
  if (id) qs.set('t', id);
  else qs.delete('t');
  const s = qs.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
}

export function TemplatesCenter({ initial, initialSelected }: { initial: TemplatesView | null; initialSelected: string | null }) {
  const q = useQuery({
    queryKey: templateKeys.view(),
    queryFn: ({ signal }) => fetchTemplatesView(signal),
    initialData: initial ?? undefined,
    initialDataUpdatedAt: initial ? new Date(initial.generatedAt).getTime() : undefined,
    staleTime: 30_000,
  });

  return (
    <QueryState query={q} skeleton="cards" isEmpty={() => false}>
      {(data) => <Center data={data} initialSelected={initialSelected} refetch={() => void q.refetch()} />}
    </QueryState>
  );
}

function Center({ data, initialSelected, refetch }: { data: TemplatesView; initialSelected: string | null; refetch: () => void }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<TemplateInput[]>(data.templates);
  const [baseVersion, setBaseVersion] = useState(data.version);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(data.templates));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected ?? readUrlTemplate());
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'content' | 'results'>('content');
  const [conflict, setConflict] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const dirty = JSON.stringify(drafts) !== snapshot;

  // Sunucu verisi tazelendiğinde (gönderim sonrası istatistik vb.) TASLAĞA DOKUNULMAZ (Bulgu 1);
  // yalnız kaydedilmemiş değişiklik yoksa şablonlar sunucuyla eşitlenir.
  useEffect(() => {
    if (!dirty) {
      setDrafts(data.templates);
      setSnapshot(JSON.stringify(data.templates));
      setBaseVersion(data.version);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => writeUrlTemplate(selectedId), [selectedId]);

  useEffect(() => {
    try {
      setTestTo(window.localStorage.getItem(TEST_TO_KEY) ?? '');
    } catch {
      /* depolama kapalı */
    }
  }, []);

  // Kaydedilmemiş değişiklik varken sekme kapatma / yenileme uyarısı.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const selected = drafts.find((t) => t.id === selectedId) ?? null;
  const savedIds = useMemo(() => new Set(data.templates.map((t) => t.id)), [data.templates]);
  const savedSelected = selected ? data.templates.find((t) => t.id === selected.id) : undefined;
  const selectedDirty = !!selected && JSON.stringify(selected) !== JSON.stringify(savedSelected);

  const update = useCallback((id: string, patch: Partial<TemplateInput>) => {
    setDrafts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    const now = istanbulNowLocal();
    const soon = istanbulNowLocal(new Date(Date.now() + 3 * 86_400_000));
    return drafts.filter((t) => {
      const st = data.stats[t.id];
      const archived = !!t.archivedAt;
      if (filter === 'archived' ? !archived : archived) return false;
      if (filter === 'unsent' && (st?.sent ?? 0) + (st?.errored ?? 0) > 0) return false;
      if (filter === 'sent' && !(st && st.sent > 0)) return false;
      if (filter === 'error' && !(st && st.errored > 0)) return false;
      if (filter === 'due' && !(t.deadline && /T/.test(t.deadline) && t.deadline >= now && t.deadline <= soon)) return false;
      if (!term) return true;
      return [t.recipientName, t.email, t.department, t.subject].some((v) => v.toLocaleLowerCase('tr-TR').includes(term));
    });
  }, [drafts, data.stats, filter, search]);

  const groups = useMemo(() => {
    const m = new Map<string, TemplateInput[]>();
    for (const t of filtered) m.set(t.department || 'Genel', [...(m.get(t.department || 'Genel') ?? []), t]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [filtered]);

  const createNew = (kind: InternEmailKind) => {
    const t: TemplateInput = {
      id: newTemplateId(),
      kind,
      department: 'Genel',
      recipientName: '',
      email: '',
      subject: STARTER[kind].subject,
      body: STARTER[kind].body,
      reminder: true,
      archivedAt: null,
    };
    setDrafts((l) => [t, ...l]);
    setFilter('active');
    setSelectedId(t.id);
    setTab('content');
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const parsed = saveTemplatesSchema.safeParse({ baseVersion, templates: drafts });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const idx = typeof issue.path[1] === 'number' ? issue.path[1] : -1;
        const bad = idx >= 0 ? drafts[idx] : null;
        if (bad) {
          setSelectedId(bad.id);
          setTab('content');
        }
        throw new Error(`${bad ? `"${bad.subject || bad.id}": ` : ''}${issue.message}`);
      }
      return saveTemplatesApi(baseVersion, parsed.data.templates);
    },
    onSuccess: (r) => {
      setBaseVersion(r.version);
      setSnapshot(JSON.stringify(drafts));
      setConflict(false);
      toast.success('Şablonlar kaydedildi.');
      void qc.invalidateQueries({ queryKey: templateKeys.view() });
    },
    onError: (e) => {
      if (e instanceof MailApiError && e.status === 409) setConflict(true);
      toast.error(errorText(e));
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Önce bir şablon seçin.');
      const parsed = templateInputSchema.safeParse(selected);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Şablon geçersiz.');
      return sendTestApi(parsed.data, testTo.trim());
    },
    onSuccess: (r) => {
      try {
        window.localStorage.setItem(TEST_TO_KEY, testTo.trim());
      } catch {
        /* depolama kapalı */
      }
      if (r.failed) toast.error(`Test gönderilemedi: ${r.results[0]?.error ?? 'bilinmeyen hata'}`);
      else toast.success(`Test maili (ekrandaki taslak) ${testTo.trim()} adresine gönderildi.`);
      void qc.invalidateQueries({ queryKey: templateKeys.view() });
      if (selected) void qc.invalidateQueries({ queryKey: templateKeys.history(selected.id) });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const discard = () => {
    setDrafts(data.templates);
    setSnapshot(JSON.stringify(data.templates));
    setBaseVersion(data.version);
    setConflict(false);
    if (selectedId && !data.templates.some((t) => t.id === selectedId)) setSelectedId(null);
  };

  const afterSend = (summary: string, okAll: boolean) => {
    (okAll ? toast.success : toast.warning)(summary);
    void qc.invalidateQueries({ queryKey: templateKeys.view() });
    if (selected) void qc.invalidateQueries({ queryKey: templateKeys.history(selected.id) });
  };

  const activeSaved = data.templates.filter((t) => !t.archivedAt);
  const canSendSelected = !!selected && savedIds.has(selected.id) && !selectedDirty && !selected.archivedAt && splitRecipients(selected.email).length > 0;

  return (
    <PanelPage
      register="ops"
      width="full"
      header={
        <PageHeader
          eyebrow="İletişim"
          title="Mail şablonları"
          description="Stajyer görev, karşılama, hatırlatma ve genel mailleri: yaz, canlı önizle, test et, güvenle gönder, sonucu izle."
          icon={<Mail className="h-5 w-5" aria-hidden />}
          actions={
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="min-h-11">
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Yeni şablon
                    <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel><AdminIletisimText k="templateType" /></DropdownMenuLabel>
                  {INTERN_EMAIL_KINDS.map((k) => (
                    <DropdownMenuItem key={k.value} onSelect={() => createNew(k.value)} className="min-h-11 flex-col items-start gap-0.5">
                      <span className="font-medium">{k.label}</span>
                      <span className="text-xs text-fg-muted">{k.hint}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setBulkOpen(true)}
                disabled={dirty || activeSaved.length === 0 || !data.mailConfigured}
                title={dirty ? 'Önce değişiklikleri kaydedin' : undefined}
              >
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Toplu gönder
              </Button>
            </div>
          }
          meta={
            <p className="text-sm text-fg-muted" aria-live="polite">
              {dirty ? (
                <span className="font-medium text-warning"><AdminIletisimText k="unsavedChanges" /></span>
              ) : data.updatedAt ? (
                <>Kaydedildi · {fmtAgo(data.updatedAt)}{data.updatedByName ? ` · ${data.updatedByName}` : ''}</>
              ) : (
                'Henüz kayıt yok'
              )}
            </p>
          }
        />
      }
      toolbar={<CommTabs active="templates" />}
    >
      {!data.mailConfigured && (
        <InlineError variant="banner" tone="warning">
          Mail gönderimi yapılandırılmamış (SMTP veya Resend). Şablonları düzenleyebilirsiniz ama test ve gerçek gönderim çalışmaz.
        </InlineError>
      )}
      {data.trackingOriginLocal && (
        <InlineError variant="banner" tone="warning">
          Açılma pikseli localhost adresine gömülüyor; alıcı tarafında yüklenemez ve açılmalar kaydedilmez. <code>MAIL_PUBLIC_ORIGIN</code> ayarlayın.
        </InlineError>
      )}
      {conflict && (
        <InlineError variant="banner" onRetry={() => { discard(); refetch(); }}>
          Şablonlar siz düzenlerken başka bir yönetici tarafından değiştirildi. &quot;Tekrar dene&quot; güncel hâli yükler; kaydedilmemiş metninizi önce kopyalayın.
        </InlineError>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[18rem_minmax(0,1fr)_minmax(0,30rem)]">
        {/* Liste */}
        <section aria-label="Şablon listesi" className={cn('min-w-0 space-y-3', selected && 'hidden lg:block')}>
          <div className="relative">
            <Label htmlFor="tpl-search" className="sr-only"><AdminIletisimText k="searchTemplates" /></Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              id="tpl-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad, e-posta, departman, konu"
              className="min-h-11 pl-9"
            />
          </div>
          <ChoiceChips<Filter> aria-label="Şablon filtresi" size="sm" scroll options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
          <div className="max-h-[calc(100dvh-18rem)] overflow-y-auto rounded-card border border-border bg-surface-1">
            {drafts.length === 0 ? (
              <EmptyState
                compact
                variant="first-use"
                title="Henüz şablon yok"
                description="Sağ üstteki “Yeni şablon” ile ilk maili oluşturun."
                className="p-4"
              />
            ) : groups.length === 0 ? (
              <EmptyState compact variant="no-results" title="Eşleşen şablon yok" className="p-4" />
            ) : (
              groups.map(([dept, list]) => (
                <div key={dept}>
                  <p className="sticky top-0 z-raised bg-surface-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">{dept}</p>
                  <ul className="divide-y divide-border">
                    {list.map((t) => (
                      <li key={t.id}>
                        <TemplateRow
                          t={t}
                          active={t.id === selectedId}
                          stat={data.stats[t.id]}
                          replies={data.repliesByTemplate[t.id] ?? 0}
                          unsaved={!savedIds.has(t.id) || JSON.stringify(t) !== JSON.stringify(data.templates.find((x) => x.id === t.id))}
                          onOpen={() => {
                            setSelectedId(t.id);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Düzenleyici */}
        <section aria-label="Şablon düzenleyici" className={cn('min-w-0', !selected && 'hidden lg:block')}>
          {!selected ? (
            <div className="flex min-h-[20rem] items-center justify-center rounded-card border border-dashed border-border p-6">
              <EmptyState compact icon={Mail} title="Bir şablon seçin" description="Soldan bir şablon seçin ya da yenisini oluşturun." />
            </div>
          ) : (
            <div className="space-y-4 rounded-card border border-border bg-surface-1 p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-2">
                <Button variant="ghost" className="min-h-11 lg:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                  Şablonlar
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-fg">{selected.subject || '(konu yok)'}</h2>
                  <p className="text-sm text-fg-muted">
                    {INTERN_EMAIL_KINDS.find((k) => k.value === selected.kind)?.label} · {selected.department}
                    {selected.deadline ? ` · son teslim ${fmtDeadline(selected.deadline)}` : ''}
                  </p>
                </div>
                <Button variant="outline" className="min-h-11 2xl:hidden" onClick={() => setPreviewOpen(true)}>
                  <Eye className="mr-2 h-4 w-4" aria-hidden />
                  Önizle
                </Button>
                {selected.archivedAt ? (
                  <Button variant="outline" className="min-h-11" onClick={() => update(selected.id, { archivedAt: null })}>
                    <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden />
                    Arşivden çıkar
                  </Button>
                ) : (
                  <Button variant="ghost" className="min-h-11" onClick={() => update(selected.id, { archivedAt: new Date().toISOString() })}>
                    <Archive className="mr-2 h-4 w-4" aria-hidden />
                    Arşivle
                  </Button>
                )}
              </div>
              {selected.archivedAt && (
                <InlineError variant="banner" tone="info">
                  Arşivlenmiş şablon gönderilmez ve hatırlatma almaz; gönderim geçmişi korunur.
                </InlineError>
              )}

              <SectionTabs
                ariaLabel="Şablon bölümleri"
                value={tab}
                onValueChange={(v) => setTab(v as 'content' | 'results')}
                tabs={[
                  { value: 'content', label: 'İçerik' },
                  { value: 'results', label: 'Sonuçlar', count: data.stats[selected.id]?.sent || undefined },
                ]}
              >
                {(active) =>
                  active === 'results' ? (
                    <ResultsPanel
                      templateId={selected.id}
                      stat={data.stats[selected.id]}
                      testStat={data.testStats[selected.id]}
                      reminder={data.reminders[selected.id]}
                      isTask={selected.kind === 'task'}
                    />
                  ) : (
                    <TemplateEditor draft={selected} onChange={(patch) => update(selected.id, patch)} />
                  )
                }
              </SectionTabs>

              {/* Test + gönder */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1 space-y-1.5">
                    <Label htmlFor="test-to">Test adresi</Label>
                    <Input id="test-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="sen@ornek.com" className="min-h-11" />
                  </div>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => testMut.mutate()}
                    disabled={testMut.isPending || !testTo.trim() || !data.mailConfigured}
                    aria-busy={testMut.isPending}
                  >
                    {testMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="mr-2 h-4 w-4" aria-hidden />}
                    Taslağı test et
                  </Button>
                  <Button className="min-h-11" onClick={() => setSendOpen(true)} disabled={!canSendSelected || !data.mailConfigured}>
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    {sendLabelFor(selected.kind)}
                  </Button>
                </div>
                <p className="text-xs text-fg-muted">
                  Test, ekrandaki (kaydedilmemiş olabilir) taslağı gönderir ve konuya [TEST] ekler.
                  {!canSendSelected && !selected.archivedAt
                    ? selectedDirty || !savedIds.has(selected.id)
                      ? ' Gerçek gönderim için önce kaydedin.'
                      : splitRecipients(selected.email).length === 0
                        ? ' Gerçek gönderim için alıcı ekleyin.'
                        : ''
                    : ''}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Önizleme: geniş ekranda yan panel */}
        {selected && (
          <aside aria-label="Önizleme" className="hidden min-w-0 2xl:block">
            <div className="sticky top-4 rounded-card border border-border bg-surface-1 p-4">
              <PreviewPane draft={selected} />
            </div>
          </aside>
        )}
      </div>

      {selected && (
        <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle><AdminIletisimText k="preview" /></SheetTitle>
            </SheetHeader>
            <PreviewPane draft={selected} className="mt-4" />
          </SheetContent>
        </Sheet>
      )}

      {/* Kaydet çubuğu (yapışkan, mobilde güvenli alan) */}
      {dirty && (
        <div className="sticky bottom-0 z-raised -mx-1 flex flex-wrap items-center gap-2 rounded-card border border-warning-border bg-surface-elevated p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] qx-elevation-2">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-fg"><AdminIletisimText k="unsavedSendNote" /></p>
          <Button variant="ghost" className="min-h-11" onClick={discard} disabled={saveMut.isPending}>
            <Undo2 className="mr-2 h-4 w-4" aria-hidden />
            Vazgeç
          </Button>
          <Button className="min-h-11" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} aria-busy={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
            Kaydet
          </Button>
        </div>
      )}

      {selected && savedSelected && (
        <SingleSendDialog open={sendOpen} onOpenChange={setSendOpen} tpl={savedSelected} stat={data.stats[selected.id]} onDone={afterSend} />
      )}
      <BulkSendDialog open={bulkOpen} onOpenChange={setBulkOpen} templates={activeSaved} stats={data.stats} onDone={afterSend} />
    </PanelPage>
  );
}

function TemplateRow({
  t,
  active,
  stat,
  replies,
  unsaved,
  onOpen,
}: {
  t: TemplateInput;
  active: boolean;
  stat: TemplatesView['stats'][string] | undefined;
  replies: number;
  unsaved: boolean;
  onOpen: () => void;
}) {
  const recipients = splitRecipients(t.email);
  const status = !recipients.length
    ? { label: 'Alıcı yok', tone: 'warning' as const }
    : stat?.errored
      ? { label: `${stat.errored} hata`, tone: 'danger' as const }
      : stat?.sent
        ? { label: `${stat.opened}/${stat.sent} açtı`, tone: stat.opened ? ('success' as const) : ('neutral' as const) }
        : { label: 'Gönderilmedi', tone: 'neutral' as const };
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
        active ? 'bg-brand-subtle' : 'hover:bg-surface-3',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{t.recipientName || recipients[0] || '(alıcısız)'}</span>
        {unsaved && (
          <span className="rounded-chip bg-warning-subtle px-1.5 text-[11px] font-medium text-warning">
            Kaydedilmedi
          </span>
        )}
      </span>
      <span className="truncate text-xs text-fg-muted">{t.subject}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge size="sm" tone={status.tone} label={status.label} />
        {replies > 0 && <StatusBadge size="sm" tone="info" label={`${replies} yanıt`} />}
        {t.deadline && /T/.test(t.deadline) && (
          <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
            <CalendarClock className="h-3 w-3" aria-hidden />
            {fmtDeadline(t.deadline)}
          </span>
        )}
      </span>
    </button>
  );
}
