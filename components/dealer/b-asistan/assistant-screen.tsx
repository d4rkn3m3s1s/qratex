'use client';

/**
 * `/dealer/assistant` istemci adası. İlk veri (açılış özeti, sohbet listesi, `?c=` sohbeti)
 * SSR'dan HydrationBoundary ile gelir.
 *
 * Yerleşim: masaüstünde daraltılabilir sohbet listesi (tercih hatırlanır) + sohbet; mobilde liste
 * bir çekmecede (varsayılan kapalı — ai-chat Bulgu 4). Seçili sohbet URL'de (`?c=`): yenilemede
 * kaybolmaz, derin bağlantıyla paylaşılır. `?q=` başka sayfadan gelen soruyu kutuya yazar.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Plus, MessagesSquare } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { IconButton } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import { AssistantChat } from './assistant-chat';
import { ConversationList } from './conversation-list';
import { useAssistantCopy } from './copy';
import { useAssistantOverview, useConversation } from './use-assistant';

const LIST_PREF_KEY = 'qx.assistant.listOpen';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function writeUrl(patch: Record<string, string | null>, push = false) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (push) window.history.pushState(window.history.state, '', next);
  else window.history.replaceState(window.history.state, '', next);
}

function newNonce(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function AssistantScreen() {
  const copy = useAssistantCopy();
  const sp = useSearchParams();
  const urlId = sp.get('c');
  const conversationId = urlId && ID_RE.test(urlId) ? urlId : null;
  const initialQuestion = sp.get('q');
  const [newKey, setNewKey] = useState('initial');
  const [listOpen, setListOpen] = useState(true);
  const [mobileListOpen, setMobileListOpen] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LIST_PREF_KEY);
      if (v === '0') setListOpen(false);
    } catch {
      /* depolama kapalı */
    }
  }, []);
  const toggleList = () => {
    setListOpen((o) => {
      try {
        window.localStorage.setItem(LIST_PREF_KEY, o ? '0' : '1');
      } catch {
        /* depolama kapalı */
      }
      return !o;
    });
  };

  const overview = useAssistantOverview();
  const conversation = useConversation(conversationId);

  const select = useCallback((id: string | null) => {
    writeUrl({ c: id, q: null }, true);
    setMobileListOpen(false);
  }, []);
  const startNew = useCallback(() => {
    setNewKey(newNonce());
    writeUrl({ c: null, q: null }, true);
    setMobileListOpen(false);
  }, []);
  const onConversationChange = useCallback((id: string | null) => writeUrl({ c: id, q: null }), []);

  const title = conversationId ? conversation.data?.title || copy.untitled : copy.newChat;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div
        className={cn(
          'grid h-[calc(100dvh-var(--qx-tabbar-h,0px)-7.5rem)] min-h-[26rem] overflow-hidden rounded-card border border-border bg-surface-1 sm:h-[calc(100dvh-9rem)] lg:h-[calc(100dvh-9.5rem)]',
          listOpen ? 'lg:grid-cols-[17rem_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)]',
        )}
      >
        {listOpen && (
          <aside className="hidden min-h-0 border-e border-border lg:flex lg:flex-col">
            <ConversationList activeId={conversationId} onSelect={select} onNew={startNew} className="flex-1" />
          </aside>
        )}
        <section className="flex min-h-0 min-w-0 flex-col" aria-labelledby="assistant-title">
          <header className="flex min-h-14 items-center gap-1.5 border-b border-border px-2 sm:px-3">
            <IconButton
              className="lg:hidden"
              aria-label={copy.openConversations}
              aria-expanded={mobileListOpen}
              icon={<MessagesSquare />}
              variant="ghost"
              onClick={() => setMobileListOpen(true)}
            />
            <IconButton
              className="hidden lg:inline-flex"
              aria-label={listOpen ? copy.closeConversations : copy.openConversations}
              aria-expanded={listOpen}
              icon={listOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
              variant="ghost"
              onClick={toggleList}
            />
            <div className="min-w-0 flex-1">
              <p className="qx-overline text-fg-muted">{copy.title}</p>
              <h1 id="assistant-title" className="truncate qx-body font-semibold text-fg">
                {title}
              </h1>
            </div>
            <IconButton aria-label={copy.newChat} icon={<Plus />} variant="outline" onClick={startNew} />
          </header>
          <AssistantChat
            className="flex-1"
            conversationId={conversationId}
            newKey={newKey}
            onConversationChange={onConversationChange}
            overview={overview.data}
            overviewError={overview.isError}
            onRetryOverview={() => overview.refetch()}
            initialQuestion={conversationId ? null : initialQuestion}
          />
        </section>
      </div>

      <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}>
        <SheetContent side="left" className="flex w-[min(20rem,88vw)] flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{copy.conversations}</SheetTitle>
            <SheetDescription>{copy.searchLabel}</SheetDescription>
          </SheetHeader>
          <ConversationList activeId={conversationId} onSelect={select} onNew={startNew} className="flex-1 pt-10" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
