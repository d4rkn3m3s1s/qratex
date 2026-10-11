'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, keepPreviousData, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  CheckCheck,
  Clock3,
  Inbox,
  Loader2,
  MailQuestion,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Users,
  Mail as MailIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { DURATION, useMotionPolicy } from '@/lib/motion';
import {
  INBOX_VIEWS,
  INBOX_VIEW_META,
  RETENTION_OPTIONS,
  type InboxListItem,
  type InboxListPage,
  type InboxOverview,
  type InboxView,
} from '@/lib/mail-center/inbox-contract';
import {
  deleteInbox,
  errorText,
  fetchInboxList,
  fetchInboxOverview,
  inboxKeys,
  patchInbox,
  replyInbox,
  saveInboxRetention,
  syncInboxNow,
} from '../api';
import { CommTabs } from '../comm-tabs';
import { fmtAgo, fmtListDate, initials } from '../format';
import { ReadingPane, type ReadingPaneHandle } from './reading-pane';

const VIEW_ICON: Record<InboxView, LucideIcon> = {
  inbox: Inbox,
  awaiting: MailQuestion,
  intern: Users,
  unread: MailIcon,
  attachments: Paperclip,
  bounce: AlertTriangle,
  sent: Send,
  archived: Archive,
};

type Initial = { overview: InboxOverview | null; list: InboxListPage | null; view: InboxView; q: string; id: string | null };

function writeUrl(state: { view: InboxView; q: string; id: string | null }) {
  const qs = new URLSearchParams();
  if (state.view !== 'inbox') qs.set('view', state.view);
  if (state.q) qs.set('q', state.q);
  if (state.id) qs.set('id', state.id);
  const s = qs.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
}

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

export function InboxCenter({ initial }: { initial: Initial }) {
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const [view, setView] = useState<InboxView>(initial.view);
  const [search, setSearch] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [selectedId, setSelectedId] = useState<string | null>(initial.id);
  const searchRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<ReadingPaneHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  // Arama 250 ms debounce (her tuşta istek yok, Bulgu 6).
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => writeUrl({ view, q, id: selectedId }), [view, q, selectedId]);

  const overview = useQuery({
    queryKey: inboxKeys.overview(),
    queryFn: ({ signal }) => fetchInboxOverview(signal),
    initialData: initial.overview ?? undefined,
    initialDataUpdatedAt: initial.overview ? new Date(initial.overview.generatedAt).getTime() : undefined,
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });

  const useInitialList = firstLoad.current && view === initial.view && q === initial.q && initial.list;
  const list = useInfiniteQuery({
    queryKey: inboxKeys.list(view, q),
    queryFn: ({ pageParam, signal }) => fetchInboxList(view, q, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    ...(useInitialList ? { initialData: { pages: [initial.list!], pageParams: [null] } } : {}),
  });
  useEffect(() => {
    firstLoad.current = false;
  }, []);

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const matched = list.data?.pages[0]?.matched ?? 0;

  const invalidateAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: inboxKeys.all });
  }, [qc]);

  // Liste önbelleğinde tek satırı güncelle / çıkar (iyimser).
  const patchListItem = useCallback(
    (id: string, fn: (it: InboxListItem) => InboxListItem | null) => {
      qc.setQueriesData<InfiniteData<InboxListPage>>({ queryKey: inboxKeys.lists() }, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                items: p.items.flatMap((it) => {
                  if (it.id !== id) return [it];
                  const next = fn(it);
                  return next ? [next] : [];
                }),
              })),
            }
          : old
      );
    },
    [qc]
  );

  const seenMut = useMutation({
    mutationFn: ({ id, seen }: { id: string; seen: boolean }) => patchInbox(id, { seen }),
    onMutate: ({ id, seen }) => {
      patchListItem(id, (it) => ({ ...it, seen }));
      qc.setQueryData(inboxKeys.detail(id), (old: unknown) => {
        const o = old as { message: { seen: boolean } } | undefined;
        return o ? { ...o, message: { ...o.message, seen } } : o;
      });
    },
    onError: (e) => {
      toast.error(errorText(e));
      invalidateAll();
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: inboxKeys.overview() }),
  });

  const archiveMut = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => patchInbox(id, { archived }),
    onMutate: ({ id }) => {
      patchListItem(id, () => null);
    },
    onSuccess: (_d, { archived, id }) => {
      toast.success(archived ? 'Mail arşivlendi.' : 'Mail gelen kutusuna geri alındı.', {
        action: { label: 'Geri al', onClick: () => archiveMut.mutate({ id, archived: !archived }) },
      });
      void qc.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: invalidateAll,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteInbox(id),
    onSuccess: (_d, id) => {
      patchListItem(id, () => null);
      setSelectedId((cur) => (cur === id ? null : cur));
      toast.success('Mail kalıcı olarak silindi.');
    },
    onSettled: invalidateAll,
  });

  const replyMut = useMutation({
    mutationFn: ({ id, message, quote }: { id: string; message: string; quote: boolean }) => replyInbox(id, { message, quote }),
    onSuccess: () => toast.success('Yanıt gönderildi ve konuşmaya eklendi.'),
    onError: (e) => toast.error(errorText(e)),
    onSettled: invalidateAll,
  });

  const syncMut = useMutation({
    mutationFn: syncInboxNow,
    onSuccess: (r) => {
      const base = r.stored > 0 ? `${r.stored} yeni mail çekildi${r.matched ? ` (${r.matched} stajyerden)` : ''}.` : 'Yeni mail yok.';
      if (r.hasMore) {
        toast.info(`${base} Kalan mailler var.`, { action: { label: 'Devam et', onClick: () => syncMut.mutate() } });
      } else toast.success(base);
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: invalidateAll,
  });

  const open = useCallback(
    (it: InboxListItem) => {
      setSelectedId(it.id);
      if (!it.seen && it.mailbox !== 'QRATEX_SENT') seenMut.mutate({ id: it.id, seen: true });
    },
    [seenMut]
  );

  // Açık maili deep-link ile geldiyse ve okunmamışsa okundu yap.
  useEffect(() => {
    if (!initial.id) return;
    const it = initial.list?.items.find((x) => x.id === initial.id);
    if (it && !it.seen) seenMut.mutate({ id: it.id, seen: true });
    // yalnız ilk yüklemede
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeView = (v: InboxView) => {
    setView(v);
    setSelectedId(null);
  };

  // Klavye kısayolları: j/k ↓/↑ gezin, e arşiv, u okunmadı, r yanıtla, / arama, Esc kapat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTyping(e.target)) return;
      if (document.querySelector('[role="alertdialog"],[role="dialog"]')) return;
      const idx = items.findIndex((x) => x.id === selectedId);
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const next = items[e.key === 'j' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1)] ?? items[0];
        if (next) {
          open(next);
          document.getElementById(`mail-row-${next.id}`)?.focus();
        }
      } else if (e.key === 'Escape' && selectedId) {
        setSelectedId(null);
      } else if (selectedId && idx >= 0) {
        const cur = items[idx];
        if (e.key === 'e' && cur.mailbox !== 'QRATEX_SENT') archiveMut.mutate({ id: cur.id, archived: cur.mailbox !== 'INBOX_ARCHIVED' });
        if (e.key === 'u' && cur.mailbox !== 'QRATEX_SENT') seenMut.mutate({ id: cur.id, seen: !cur.seen });
        if (e.key === 'r') {
          e.preventDefault();
          paneRef.current?.openReply();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedId, open, archiveMut, seenMut]);

  // Sonsuz kaydırma (sentinel görünür olunca sonraki sayfa).
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: listRef.current, rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const ov = overview.data;
  const sync = ov?.sync;

  return (
    <PanelPage
      register="ops"
      width="full"
      header={
        <PageHeader
          eyebrow="İletişim"
          title="Gelen kutusu"
          description={
            ov?.account
              ? `${ov.account} hesabına gelen mailler. Stajyer yanıtları otomatik ayrılır; okuma ve yanıt panelden yapılır.`
              : 'Şirket hesabına gelen mailler. Stajyer yanıtları otomatik ayrılır; okuma ve yanıt panelden yapılır.'
          }
          icon={<Inbox className="h-5 w-5" aria-hidden />}
          actions={
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending || ov?.inboxConfigured === false}
              aria-busy={syncMut.isPending}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', syncMut.isPending && 'motion-safe:animate-spin')} aria-hidden />
              {syncMut.isPending ? 'Senkronlanıyor…' : 'Şimdi senkronla'}
            </Button>
          }
          meta={
            sync ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted" aria-live="polite">
                <Clock3 className="h-4 w-4" aria-hidden />
                <span>
                  Son senkron: <span className="text-fg">{fmtAgo(sync.lastRunAt)}</span>
                  {sync.source ? ` · ${sync.source === 'manual' ? 'elle' : 'otomatik'}` : ''}
                </span>
                {sync.ok === false && sync.error && (
                  <span className="inline-flex items-center gap-1 text-danger">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    {sync.error}
                  </span>
                )}
                {sync.ok !== false && sync.hasMore && <span className="text-warning">Çekilmeyi bekleyen mailler var; tekrar senkronlayın.</span>}
              </p>
            ) : null
          }
        />
      }
      toolbar={<CommTabs active="inbox" unread={ov?.counts.unread} />}
    >
      {ov && !ov.inboxConfigured && (
        <InlineError variant="banner" tone="warning">
          IMAP yapılandırılmamış. Gmail uygulama şifresini <code>IMAP_USER</code>/<code>IMAP_PASS</code> (ya da <code>SMTP_USER</code>/
          <code>SMTP_PASS</code>) ortam değişkenlerine ekleyin; senkron o zamana kadar çalışmaz.
        </InlineError>
      )}
      {overview.isError && !ov && (
        <InlineError variant="banner" onRetry={() => void overview.refetch()}>
          Sayaçlar ve senkron durumu yüklenemedi: {errorText(overview.error)}
        </InlineError>
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,24rem)_minmax(0,1fr)]">
        {/* Görünümler: xl'de sol ray, daha dar ekranda yatay kaydırılan çip şeridi */}
        <nav aria-label="Gelen kutusu görünümleri" className={cn('min-w-0 md:col-span-2 xl:col-span-1', selectedId && 'hidden md:block')}>
          <ul className="flex gap-1 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {INBOX_VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              const on = v === view;
              const count = ov?.counts[v];
              return (
                <li key={v} className="shrink-0">
                  <button
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    title={INBOX_VIEW_META[v].hint}
                    onClick={() => changeView(v)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-control px-3 text-sm transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      on ? 'bg-brand-subtle font-medium text-brand' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 text-left">{INBOX_VIEW_META[v].label}</span>
                    {typeof count === 'number' && <span className="tabular-nums text-xs">{count}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {ov && <RetentionSetting value={ov.retentionDays} onSaved={invalidateAll} />}
        </nav>

        {/* Liste */}
        <section aria-label="Mail listesi" className={cn('min-w-0 space-y-3', selectedId && 'hidden md:block')}>
          <div className="relative">
            <Label htmlFor="inbox-search" className="sr-only">Gelen kutusunda ara</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              id="inbox-search"
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kişi, konu, içerik, departman ara  ( / )"
              className="min-h-11 pl-9"
            />
          </div>
          <p className="text-xs text-fg-muted" aria-live="polite">
            {list.data ? `${INBOX_VIEW_META[view].label} · ${matched} sonuç${q ? ` · "${q}"` : ''}` : ' '}
          </p>
          <div ref={listRef} className="max-h-[calc(100dvh-16rem)] min-h-[16rem] overflow-y-auto rounded-card border border-border bg-surface-1">
            <QueryState
              query={list}
              skeleton="list"
              className="p-2"
              isEmpty={() => items.length === 0}
              empty={
                q
                  ? { variant: 'no-results', title: 'Sonuç yok', description: `"${q}" için bu görünümde mail bulunamadı.`, compact: true }
                  : {
                      variant: view === 'inbox' ? 'first-use' : 'filtered',
                      title: view === 'inbox' ? 'Gelen kutusu boş' : `${INBOX_VIEW_META[view].label}: kayıt yok`,
                      description: view === 'inbox' ? 'Henüz mail çekilmedi. "Şimdi senkronla" ile ilk senkronu başlatın.' : INBOX_VIEW_META[view].hint,
                      compact: true,
                    }
              }
            >
              {() => (
                <ul role="list" className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {items.map((it) => (
                      <Motion.li
                        key={it.id}
                        layout={policy.reduce ? false : 'position'}
                        initial={policy.reduce ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={policy.reduce ? { opacity: 0 } : { opacity: 0, x: 24, height: 0 }}
                        transition={policy.transition({ duration: DURATION.base })}
                      >
                        <MailRow item={it} active={it.id === selectedId} onOpen={() => open(it)} />
                      </Motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </QueryState>
            <div ref={sentinel} aria-hidden className="h-1" />
            {list.hasNextPage && (
              <div className="p-2">
                <Button variant="ghost" className="min-h-11 w-full" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Daha fazla yükle
                </Button>
              </div>
            )}
            {!list.hasNextPage && items.length > 0 && <p className="p-3 text-center text-xs text-fg-muted">Listenin sonu · {items.length} mail</p>}
          </div>
        </section>

        {/* Okuma bölmesi */}
        <section aria-label="Okuma bölmesi" className={cn('min-w-0', !selectedId && 'hidden md:block')}>
          {selectedId ? (
            <AnimatePresence mode="wait" initial={false}>
              <Motion.div
                key={selectedId}
                initial={policy.reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={policy.transition({ duration: DURATION.fast })}
                className="rounded-card border border-border bg-surface-1 p-4 sm:p-5"
              >
                <ReadingPane
                  ref={paneRef}
                  id={selectedId}
                  onBack={() => {
                    const id = selectedId;
                    setSelectedId(null);
                    requestAnimationFrame(() => document.getElementById(`mail-row-${id}`)?.focus());
                  }}
                  onToggleSeen={(id, seen) => seenMut.mutate({ id, seen })}
                  onArchive={(id, archived) => archiveMut.mutate({ id, archived })}
                  onDelete={(id) => deleteMut.mutateAsync(id)}
                  onReply={(id, message, quote) => replyMut.mutateAsync({ id, message, quote })}
                  replyPending={replyMut.isPending}
                  mailConfigured={ov?.mailConfigured !== false}
                />
              </Motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-card border border-dashed border-border p-6">
              <EmptyState
                compact
                icon={CheckCheck}
                title="Bir mail seçin"
                description="Klavye: j / k gezin · r yanıtla · e arşivle · u okunmadı · / ara"
              />
            </div>
          )}
        </section>
      </div>
    </PanelPage>
  );
}

function MailRow({ item, active, onOpen }: { item: InboxListItem; active: boolean; onOpen: () => void }) {
  const out = item.mailbox === 'QRATEX_SENT';
  const who = out ? `Kime: ${item.toEmail ?? ''}` : item.fromName || item.fromEmail;
  return (
    <button
      type="button"
      id={`mail-row-${item.id}`}
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
      className={cn(
        'flex w-full gap-3 px-3 py-3 text-left transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
        active ? 'bg-brand-subtle' : 'hover:bg-surface-3',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          item.isFromIntern ? 'bg-brand text-brand-fg' : 'bg-surface-3 text-fg-muted',
        )}
      >
        {initials(item.fromName, out ? item.toEmail ?? '?' : item.fromEmail)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {!item.seen && !out && (
            <>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand" />
              <span className="sr-only">Okunmadı. </span>
            </>
          )}
          <span className={cn('min-w-0 flex-1 truncate text-sm', item.seen || out ? 'text-fg' : 'font-semibold text-fg')}>{who}</span>
          <time dateTime={item.sentAt} className="shrink-0 text-xs tabular-nums text-fg-muted">
            {fmtListDate(item.sentAt)}
          </time>
        </span>
        <span className={cn('block truncate text-sm', item.seen ? 'text-fg-muted' : 'font-medium text-fg')}>{item.subject || '(konu yok)'}</span>
        <span className="block truncate text-xs text-fg-muted">{item.snippet}</span>
        <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
          {item.isBounce && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-danger-subtle px-1.5 py-0.5 text-danger">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              İletilemedi
            </span>
          )}
          {item.isFromIntern && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-brand-subtle px-1.5 py-0.5 text-brand">
              <Users className="h-3 w-3" aria-hidden />
              {item.matchedRecipientName || 'Stajyer'}
              {item.matchedDepartment ? ` · ${item.matchedDepartment}` : ''}
            </span>
          )}
          {item.replied && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-success-subtle px-1.5 py-0.5 text-success">
              <CheckCheck className="h-3 w-3" aria-hidden />
              Yanıtlandı
            </span>
          )}
          {item.threadCount > 1 && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-surface-3 px-1.5 py-0.5 text-fg-muted">
              <MailIcon className="h-3 w-3" aria-hidden />
              {item.threadCount} mesaj
            </span>
          )}
          {item.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-surface-3 px-1.5 py-0.5 text-fg-muted">
              <Paperclip className="h-3 w-3" aria-hidden />
              {item.attachmentCount}
              <span className="sr-only"> ek</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function RetentionSetting({ value, onSaved }: { value: number | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: (days: number | null) => saveInboxRetention(days),
    onSuccess: (r) => {
      toast.success(r.retentionDays ? `Saklama süresi ${r.retentionDays} gün olarak kaydedildi.` : 'Saklama süresi kapatıldı.');
      onSaved();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const current = RETENTION_OPTIONS.find((o) => o.value === value)?.label ?? `${value} gün`;
  return (
    <div className="mt-3 max-w-xs xl:max-w-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-xs text-fg-muted hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Settings2 className="h-4 w-4" aria-hidden />
        <span>Saklama: {current}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-2 rounded-control border border-border bg-surface-1 p-3">
          <Label htmlFor="inbox-retention" className="text-xs">Mailleri ne kadar sakla (KVKK)</Label>
          <select
            id="inbox-retention"
            className="min-h-11 w-full rounded-control border border-strong bg-surface-1 px-2 text-sm"
            value={value ?? ''}
            disabled={mut.isPending}
            onChange={(e) => mut.mutate(e.target.value ? Number(e.target.value) : null)}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.label} value={o.value ?? ''}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-fg-muted">Süresi dolan mailler ve ekleri her gün otomatik silinir. Gmail&apos;deki kopyalar etkilenmez.</p>
        </div>
      )}
    </div>
  );
}
