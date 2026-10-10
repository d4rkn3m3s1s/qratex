'use client';

/**
 * AI Asistan istemci veri katmanı: React Query anahtarları, BFF çağrıları ve NDJSON akış kancası.
 *
 * Yarış koşulu (ai-chat Bulgu 5): her gönderim bir "sohbet anahtarı" taşır (mevcut kimlik ya da
 * yeni sohbet için `new:<nonce>`). Yanıt hangi sohbete aitse YALNIZ onun önbelleğine yazılır;
 * kullanıcı arada başka sohbete geçtiyse görünümü ezilmez.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createNdjsonParser } from '@/lib/dealer-assistant/stream';
import { assistantKeys } from '@/lib/dealer-assistant/types';
import type {
  AssistantFact,
  AssistantLocale,
  AssistantMessage,
  AssistantOverview,
  AssistantPeriod,
  AssistantSource,
  AssistantToolName,
  ConversationDetail,
  ConversationListPage,
  ConversationSummary,
} from '@/lib/dealer-assistant/types';

export { assistantKeys };

export class AssistantApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = 'AssistantApiError';
  }
}

async function toApiError(res: Response): Promise<AssistantApiError> {
  let code = res.status === 404 ? 'NOT_FOUND' : res.status === 429 ? 'RATE_LIMITED' : 'INTERNAL';
  let message = '';
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      const body = (await res.json()) as { code?: unknown; error?: unknown };
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.error === 'string') message = body.error;
    } catch {
      /* gövde okunamadı */
    }
  }
  const ra = Number(res.headers.get('retry-after'));
  return new AssistantApiError(code, message, res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
}

export async function assistantFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init, headers: { accept: 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new AssistantApiError('NETWORK', '', 0);
  }
  if (!res.ok) throw await toApiError(res);
  const body = (await res.json()) as { data?: T };
  return body.data as T;
}

/* ───────────────────────── Sorgular ───────────────────────── */

export function useAssistantOverview(enabled = true) {
  return useQuery({
    queryKey: assistantKeys.overview(),
    queryFn: () => assistantFetch<AssistantOverview>('/api/dealer/assistant'),
    staleTime: 60_000,
    enabled,
  });
}

export function useConversationList(q: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: assistantKeys.list(q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams();
      if (pageParam) sp.set('cursor', pageParam);
      if (q) sp.set('q', q);
      const qs = sp.toString();
      return assistantFetch<ConversationListPage>(`/api/dealer/assistant/conversations${qs ? `?${qs}` : ''}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    enabled,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: assistantKeys.conversation(id ?? '-'),
    queryFn: () => assistantFetch<ConversationDetail>(`/api/dealer/assistant/conversations/${encodeURIComponent(id!)}`),
    enabled: !!id,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof AssistantApiError && err.status === 404) && count < 2,
  });
}

/* ───────────────────────── Değişiklikler ───────────────────────── */

type Patch = { title?: string; pinned?: boolean; period?: AssistantPeriod; rate?: { messageId: string; rating: 1 | -1 | null }; restore?: true };

function patchConversation(id: string, body: Patch) {
  return assistantFetch<ConversationSummary>(`/api/dealer/assistant/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function useConversationActions() {
  const qc = useQueryClient();
  const invalidateLists = () => qc.invalidateQueries({ queryKey: assistantKeys.lists });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => patchConversation(id, patch),
    onSuccess: (summary, { id, patch }) => {
      if (patch.title !== undefined || patch.pinned !== undefined || patch.period !== undefined) {
        qc.setQueryData<ConversationDetail>(assistantKeys.conversation(id), (old) => (old ? { ...old, ...summary, title: summary.title || old.title } : old));
      }
      void invalidateLists();
    },
  });

  const rate = useMutation({
    mutationFn: ({ id, messageId, rating }: { id: string; messageId: string; rating: 1 | -1 | null }) =>
      patchConversation(id, { rate: { messageId, rating } }),
    onMutate: ({ id, messageId, rating }) => {
      const key = assistantKeys.conversation(id);
      const prev = qc.getQueryData<ConversationDetail>(key);
      qc.setQueryData<ConversationDetail>(key, (old) =>
        old ? { ...old, messages: old.messages.map((m) => (m.id === messageId ? { ...m, rating } : m)) } : old,
      );
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
  });

  const archive = useMutation({
    mutationFn: (id: string) => assistantFetch<{ id: string }>(`/api/dealer/assistant/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: assistantKeys.conversation(id) });
      void invalidateLists();
    },
  });

  const restore = useMutation({
    mutationFn: (id: string) => patchConversation(id, { restore: true }),
    onSuccess: () => void invalidateLists(),
  });

  return { update, rate, archive, restore };
}

/* ───────────────────────── Akış ───────────────────────── */

export interface PendingTurn {
  /** Sohbet anahtarı: kimlik ya da `new:<nonce>`. */
  key: string;
  question: string;
  period: AssistantPeriod;
  regenerate: boolean;
  phase: 'streaming' | 'error';
  content: string;
  tools: AssistantToolName[];
  activeTool: AssistantToolName | null;
  facts: AssistantFact[];
  sources: AssistantSource[];
  error: { code: string; message: string; retryable: boolean; retryAfterSec: number | null } | null;
}

export interface SendInput {
  key: string;
  conversationId: string | null;
  question: string;
  period: AssistantPeriod;
  regenerate?: boolean;
  locale: AssistantLocale;
}

function applyDone(old: ConversationDetail | undefined, id: string, title: string, user: AssistantMessage, message: AssistantMessage, regenerate: boolean, period: AssistantPeriod): ConversationDetail {
  const now = new Date().toISOString();
  if (!old) {
    return { id, title, pinned: false, period, createdAt: now, updatedAt: now, messages: [user, message], truncated: false };
  }
  let messages = old.messages;
  if (regenerate) {
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { idx = i; break; }
    messages = idx >= 0 ? [...messages.slice(0, idx + 1), message] : [...messages, user, message];
  } else {
    messages = [...messages, user, message];
  }
  return { ...old, title: old.title || title, period, updatedAt: now, messages };
}

/**
 * Tek seferde bir tur. `onSettled(key, conversationId)` tur kaydedildiğinde çağrılır; çağıran,
 * kullanıcı hâlâ aynı anahtardaysa (yeni sohbet) URL'yi yeni kimliğe taşır.
 */
export function useAssistantStream(opts: { onSaved?: (key: string, conversationId: string) => void } = {}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onSavedRef = useRef(opts.onSaved);
  onSavedRef.current = opts.onSaved;

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const dismiss = useCallback(() => setPending((p) => (p && p.phase === 'error' ? null : p)), []);

  const send = useCallback(
    async (input: SendInput) => {
      if (abortRef.current) return false;
      const controller = new AbortController();
      abortRef.current = controller;
      const base: PendingTurn = {
        key: input.key,
        question: input.question,
        period: input.period,
        regenerate: input.regenerate === true,
        phase: 'streaming',
        content: '',
        tools: [],
        activeTool: null,
        facts: [],
        sources: [],
        error: null,
      };
      setPending(base);
      const fail = (code: string, message: string, retryable: boolean, retryAfterSec: number | null = null) =>
        setPending((p) => (p && p.key === input.key ? { ...p, phase: 'error', activeTool: null, error: { code, message, retryable, retryAfterSec } } : p));

      let saved = false;
      let stoppedByUser = false;
      try {
        const res = await fetch('/api/dealer/assistant/chat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
          body: JSON.stringify({
            conversationId: input.conversationId,
            question: input.regenerate ? undefined : input.question,
            period: input.period,
            locale: input.locale,
            regenerate: input.regenerate || undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = await toApiError(res);
          fail(err.code, err.message, err.status >= 500 || err.status === 429, err.retryAfterSec);
          return false;
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        const parser = createNdjsonParser((ev) => {
          switch (ev.type) {
            case 'tool':
              setPending((p) => (p ? { ...p, activeTool: ev.tool, tools: p.tools.includes(ev.tool) ? p.tools : [...p.tools, ev.tool] } : p));
              break;
            case 'fact':
              setPending((p) => (p ? { ...p, facts: [...p.facts, ev.fact] } : p));
              break;
            case 'sources':
              setPending((p) => (p ? { ...p, sources: [...p.sources, ...ev.sources] } : p));
              break;
            case 'reset':
              setPending((p) => (p ? { ...p, content: '' } : p));
              break;
            case 'delta':
              setPending((p) => (p ? { ...p, activeTool: null, content: p.content + ev.text } : p));
              break;
            case 'done': {
              saved = true;
              qc.setQueryData<ConversationDetail>(assistantKeys.conversation(ev.conversationId), (old) =>
                applyDone(old, ev.conversationId, ev.title, ev.userMessage, ev.message, input.regenerate === true, input.period),
              );
              void qc.invalidateQueries({ queryKey: assistantKeys.lists });
              void qc.invalidateQueries({ queryKey: assistantKeys.overview() });
              onSavedRef.current?.(input.key, ev.conversationId);
              setPending((p) => (p && p.key === input.key ? null : p));
              break;
            }
            case 'error':
              fail(ev.code, ev.message, ev.retryable);
              break;
            default:
              break;
          }
        });
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) parser.push(value);
        }
        parser.flush();
      } catch {
        if (controller.signal.aborted) stoppedByUser = true;
        else fail('NETWORK', '', true);
      } finally {
        abortRef.current = null;
      }
      if (stoppedByUser && !saved) {
        // Sunucu durdurulan yarım yanıtı kaydetmiş olabilir: sohbet tazelenir, taslak kalkar.
        if (input.conversationId) void qc.invalidateQueries({ queryKey: assistantKeys.conversation(input.conversationId) });
        void qc.invalidateQueries({ queryKey: assistantKeys.lists });
        setPending((p) => (p && p.key === input.key ? null : p));
      } else if (!saved) {
        setPending((p) => (p && p.key === input.key && p.phase === 'streaming' ? { ...p, phase: 'error', error: { code: 'NETWORK', message: '', retryable: true, retryAfterSec: null } } : p));
      }
      return saved;
    },
    [qc],
  );

  return { pending, send, stop, dismiss, busy: pending?.phase === 'streaming' };
}

/** Sonsuz liste sayfalarını tek diziye indirger (sabitlenenler ayrı). */
export function flattenPages(data: InfiniteData<ConversationListPage> | undefined): { pinned: ConversationSummary[]; items: ConversationSummary[] } {
  if (!data) return { pinned: [], items: [] };
  return { pinned: data.pages[0]?.pinned ?? [], items: data.pages.flatMap((p) => p.items) };
}
