'use client';

/**
 * AI Asistan sohbet bölmesi — tam sayfa (`/dealer/assistant`) ve ⌘J çekmecesi aynı bileşeni
 * kullanır. Ops kaydı: sakin; tek "canlılık" sinyali akan metin (rapor vizyonu).
 *
 * Erişilebilirlik: mesaj akışı `role="log"` + `aria-live="polite"` + `aria-busy`; yazı alanı
 * etiketli; tüm ikon butonların adı var; dokunma hedefleri ≥ 44px; kaydırma azaltılmış
 * harekete uyar; IME birleşik girişte Enter göndermez.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowUp, Bot, QrCode, Settings2, Sparkles, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/states';
import { IconButton } from '@/components/ds/a11y';
import { useReducedMotionPref } from '@/lib/motion';
import { periodLabel } from '@/lib/dealer-assistant/labels';
import { ASSISTANT_PERIODS, QUESTION_MAX, type AssistantOverview, type AssistantPeriod } from '@/lib/dealer-assistant/types';
import { cn } from '@/lib/utils';
import { errorText, suggestionText, useAssistantCopy } from './copy';
import { AssistantBubble, UserBubble } from './message-bubble';
import { AssistantApiError, useAssistantStream, useConversation, useConversationActions } from './use-assistant';

export interface AssistantChatProps {
  conversationId: string | null;
  /** Yeni sohbet anahtarı (ebeveyn "Yeni sohbet"te yeniler). */
  newKey: string;
  onConversationChange: (id: string | null) => void;
  overview: AssistantOverview | undefined;
  overviewError?: boolean;
  onRetryOverview?: () => void;
  variant?: 'page' | 'drawer';
  /** Başka sayfadan gelen soru (`?q=`): kutuya yazılır, kendiliğinden GÖNDERİLMEZ (maliyet sürprizi yok). */
  initialQuestion?: string | null;
  className?: string;
}

export function AssistantChat({
  conversationId,
  newKey,
  onConversationChange,
  overview,
  overviewError,
  onRetryOverview,
  variant = 'page',
  initialQuestion,
  className,
}: AssistantChatProps) {
  const copy = useAssistantCopy();
  const reduce = useReducedMotionPref();
  const inputId = useId();
  const hintId = useId();
  const key = conversationId ?? `new:${newKey}`;
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    keyRef.current = key;
  });

  const conversation = useConversation(conversationId);
  const { rate, update } = useConversationActions();
  const { pending, send, stop, dismiss, busy } = useAssistantStream({
    onSaved: (sentKey, id) => {
      // Yanıt yeni sohbete aitse ve kullanıcı hâlâ oradaysa URL yeni kimliğe taşınır
      // (başka sohbete geçtiyse görünümü ezilmez — ai-chat Bulgu 5).
      if (sentKey.startsWith('new:') && keyRef.current === sentKey) onConversationChange(id);
    },
  });

  const [draft, setDraft] = useState(initialQuestion?.slice(0, QUESTION_MAX) ?? '');
  const [newPeriod, setNewPeriod] = useState<AssistantPeriod | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (initialQuestion) {
      setDraft(initialQuestion.slice(0, QUESTION_MAX));
      textareaRef.current?.focus();
    }
  }, [initialQuestion]);

  const period: AssistantPeriod = conversationId
    ? conversation.data?.period ?? overview?.defaultPeriod ?? 'last30'
    : newPeriod ?? overview?.defaultPeriod ?? 'last30';

  const messages = useMemo(() => (conversationId ? conversation.data?.messages ?? [] : []), [conversationId, conversation.data?.messages]);
  const myPending = pending && pending.key === key ? pending : null;
  const status = overview?.status ?? 'ready';
  const quota = overview?.quota ?? null;
  const blocked = status !== 'ready' || quota?.exhausted === true;
  const hasData = overview?.data.hasAnyData ?? true;

  // Otomatik kaydırma: kullanıcı en alttaysa yeni içerikte alta iner.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages.length, myPending?.content, myPending?.facts.length, myPending?.phase, reduce]);
  useEffect(() => {
    stickRef.current = true;
  }, [key]);

  // Yazı alanı otomatik yükseklik.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [draft]);

  const locale = copy.locale;
  const submit = useCallback(
    async (question: string, opts: { regenerate?: boolean } = {}) => {
      const q = question.trim();
      if (busy || blocked) return;
      if (!opts.regenerate && q.length < 2) return;
      stickRef.current = true;
      if (!opts.regenerate) setDraft('');
      const ok = await send({ key, conversationId, question: q, period, regenerate: opts.regenerate, locale });
      if (!ok && !opts.regenerate) {
        // Gönderilemeyen soru kaybolmaz: kutu boşsa geri yazılır.
        setDraft((d) => (d ? d : q));
      }
    },
    [busy, blocked, send, key, conversationId, period, locale],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void submit(draft);
    }
  };

  const changePeriod = (p: AssistantPeriod) => {
    if (conversationId) update.mutate({ id: conversationId, patch: { period: p } }, { onError: () => toast.error(copy.actionFailed) });
    else setNewPeriod(p);
  };

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  })();

  const convError = conversation.error;
  const notFound = convError instanceof AssistantApiError && convError.status === 404;
  const showWelcome = !conversationId && !myPending;
  const quotaPct = quota ? Math.min(100, Math.round((quota.usedTokens / Math.max(1, quota.limitTokens)) * 100)) : 0;
  const resetTime = quota ? new Date(quota.resetsAt).toLocaleTimeString(copy.tag, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '';
  const remaining = QUESTION_MAX - draft.length;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={busy}
        aria-label={conversation.data?.title || copy.title}
      >
        {conversationId && conversation.isPending ? (
          <SkeletonList rows={3} />
        ) : conversationId && notFound ? (
          <EmptyState
            variant="no-results"
            title={copy.conversationMissing}
            description={null}
            action={
              <Button type="button" onClick={() => onConversationChange(null)} className="min-h-11">
                {copy.newChat}
              </Button>
            }
          />
        ) : conversationId && convError ? (
          <ErrorState title={copy.loadConversationError} onRetry={() => conversation.refetch()} />
        ) : showWelcome ? (
          <Welcome
            overview={overview}
            overviewError={overviewError}
            onRetryOverview={onRetryOverview}
            variant={variant}
            onPick={(q) => void submit(q)}
            disabled={busy || blocked}
          />
        ) : null}

        {conversation.data?.truncated && <p className="mb-3 text-center text-xs text-fg-muted">{copy.truncatedNote}</p>}

        <ol className="mx-auto max-w-3xl space-y-5">
          {messages.map((m, i) => {
            // Yeniden üretim sürerken eski son yanıt gizlenir (taslak onun yerine akar).
            if (myPending?.regenerate && i === lastAssistantIdx) return null;
            return m.role === 'user' ? (
              <UserBubble key={m.id} content={m.content} createdAt={m.createdAt} copy={copy} />
            ) : (
              <AssistantBubble
                key={m.id}
                message={m}
                copy={copy}
                isLast={i === lastAssistantIdx && i === messages.length - 1}
                busy={busy || blocked}
                onRate={conversationId ? (r) => rate.mutate({ id: conversationId, messageId: m.id, rating: r }, { onSuccess: () => r && toast.success(copy.ratedThanks), onError: () => toast.error(copy.actionFailed) }) : undefined}
                onRegenerate={conversationId ? () => void submit('', { regenerate: true }) : undefined}
              />
            );
          })}
          {myPending && !myPending.regenerate && <UserBubble content={myPending.question} copy={copy} failed={myPending.phase === 'error'} />}
          {myPending && myPending.phase === 'streaming' && (
            <AssistantBubble
              message={{ id: 'pending', content: myPending.content, createdAt: '', facts: myPending.facts, sources: myPending.sources }}
              copy={copy}
              streaming
              activity={myPending.activeTool ? copy.toolRunning[myPending.activeTool] : null}
            />
          )}
          {myPending && myPending.phase === 'error' && myPending.error && (
            <li className="rounded-lg border border-danger/40 bg-surface-1 p-3 text-sm" role="alert">
              <p className="font-medium text-danger">{errorText(myPending.error.code, copy)}</p>
              {myPending.error.retryAfterSec ? <p className="mt-0.5 text-xs text-fg-muted">{copy.retryIn(myPending.error.retryAfterSec)}</p> : null}
              {myPending.error.code === 'AI_DISABLED' && (
                <Link href="/dealer/settings" className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-brand hover:underline">
                  {copy.status.ai_disabled.cta}
                </Link>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {myPending.error.retryable && (
                  <Button type="button" size="sm" className="min-h-10" onClick={() => void submit(myPending.question, { regenerate: myPending.regenerate })} disabled={blocked}>
                    {copy.retry}
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" className="min-h-10" onClick={dismiss}>
                  <X className="me-1 h-4 w-4" aria-hidden />
                  {copy.cancel}
                </Button>
              </div>
            </li>
          )}
        </ol>
      </div>

      <form
        className="border-t border-border bg-surface-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
      >
        <div className="mx-auto max-w-3xl space-y-2">
          {blocked && overview && <BlockedNotice overview={overview} resetTime={resetTime} />}
          <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-0 p-1.5 focus-within:ring-2 focus-within:ring-focus">
            <label htmlFor={inputId} className="sr-only">
              {copy.composerLabel}
            </label>
            <textarea
              id={inputId}
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, QUESTION_MAX))}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={QUESTION_MAX}
              placeholder={copy.composerPlaceholder}
              aria-describedby={hintId}
              disabled={blocked || (!hasData && !conversationId)}
              className="max-h-48 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-fg placeholder:text-fg-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            />
            {busy ? (
              <IconButton type="button" aria-label={copy.stop} icon={<Square className="fill-current" />} variant="outline" size="md" onClick={stop} />
            ) : (
              <IconButton type="submit" aria-label={copy.send} icon={<ArrowUp />} variant="solid" size="md" disabled={blocked || draft.trim().length < 2} />
            )}
          </div>
          <div id={hintId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fg-muted">
            <label className="inline-flex items-center gap-1.5">
              <span>{copy.periodLabel}</span>
              <select
                value={period}
                onChange={(e) => changePeriod(e.target.value as AssistantPeriod)}
                disabled={busy}
                className="min-h-9 rounded-md border border-border bg-surface-0 px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {ASSISTANT_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p, copy.locale)}
                  </option>
                ))}
              </select>
            </label>
            <span className="hidden sm:inline">{copy.enterHint}</span>
            {remaining < 300 ? (
              <span className={cn('tabular-nums', remaining < 50 && 'text-warning')} aria-live="polite">
                {copy.charCount(draft.length, QUESTION_MAX)}
              </span>
            ) : quota && !quota.exhausted && quotaPct >= 50 ? (
              <span className="tabular-nums">{copy.quota(quotaPct)}</span>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}

function BlockedNotice({ overview, resetTime }: { overview: AssistantOverview; resetTime: string }) {
  const copy = useAssistantCopy();
  if (overview.status === 'ai_disabled') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-surface-2 px-3 py-2 text-sm" role="status">
        <span>{copy.status.ai_disabled.desc}</span>
        <Button asChild size="sm" variant="outline" className="min-h-10">
          <Link href="/dealer/settings">
            <Settings2 className="me-1.5 h-4 w-4" aria-hidden />
            {copy.status.ai_disabled.cta}
          </Link>
        </Button>
      </div>
    );
  }
  if (overview.status === 'unconfigured') {
    return <p className="rounded-lg border border-warning/40 bg-surface-2 px-3 py-2 text-sm" role="status">{copy.status.unconfigured.desc}</p>;
  }
  if (overview.quota?.exhausted) {
    return <p className="rounded-lg border border-warning/40 bg-surface-2 px-3 py-2 text-sm" role="status">{copy.quotaExhausted(resetTime)}</p>;
  }
  return null;
}

function Welcome({
  overview,
  overviewError,
  onRetryOverview,
  variant,
  onPick,
  disabled,
}: {
  overview: AssistantOverview | undefined;
  overviewError?: boolean;
  onRetryOverview?: () => void;
  variant: 'page' | 'drawer';
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  const copy = useAssistantCopy();
  if (overviewError) return <ErrorState title={copy.overviewError} onRetry={onRetryOverview} />;
  if (!overview) return <SkeletonList rows={2} />;
  if (!overview.data.hasAnyData) {
    return (
      <EmptyState
        icon={QrCode}
        title={copy.noDataTitle}
        description={copy.noDataDesc}
        action={
          <Button asChild className="min-h-11">
            <Link href="/dealer/qr-codes">{copy.noDataCta}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className={cn('mx-auto max-w-3xl', variant === 'page' ? 'py-6 sm:py-10' : 'py-2')}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand" aria-hidden>
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className={cn('font-semibold text-fg', variant === 'page' ? 'text-lg' : 'text-base')}>{copy.welcomeTitle}</h2>
          <p className="mt-1 text-sm text-fg-muted">{copy.welcomeDesc}</p>
        </div>
      </div>
      {overview.suggestions.length > 0 && (
        <section className="mt-5" aria-label={copy.suggestionsLabel}>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {copy.suggestionsLabel}
          </h3>
          <ul className={cn('grid gap-2', variant === 'page' && 'sm:grid-cols-2')}>
            {overview.suggestions.map((s) => {
              const text = suggestionText(s, copy);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(text)}
                    className="flex min-h-11 w-full items-center rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-start text-sm text-fg transition-colors hover:border-brand-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                  >
                    {text}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
