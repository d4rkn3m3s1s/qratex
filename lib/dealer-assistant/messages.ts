/**
 * b-asistan — sohbet kaydı saf yardımcıları (jest'li; Prisma'sız).
 *
 * `AIConversation.messages` (Json) üç yazıcıdan gelmiş olabilir: eski `/api/dealer/ai-chat`,
 * `/dealer/ai-insights` sohbet sekmesi (`/api/ai/analyze?action=ask`) ve bu yüzey. Eski biçim
 * `{ role, content, timestamp }` idi. Okuma her zaman buradan geçer: dizi olmayan / bozuk değer
 * 500 üretmez ("JSON forEach 500" sınıfı), eski satırlar kararlı kimlik alır.
 */
import {
  DEFAULT_ASSISTANT_PERIOD,
  MAX_STORED_MESSAGES,
  TITLE_MAX,
  isAssistantPeriod,
  type AssistantFact,
  type AssistantMessage,
  type AssistantPeriod,
  type AssistantSource,
  type MessageStatus,
} from './types';

export const ASSISTANT_SURFACE = 'dealer_assistant';

export interface ConversationContext {
  surface: string | null;
  period: AssistantPeriod;
  pinned: boolean;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

export function newMessageId(): string {
  try {
    return `m_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  } catch {
    return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function toIso(v: unknown, fallback: string): string {
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return fallback;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cleanSources(v: unknown): AssistantSource[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(
    (s): s is AssistantSource =>
      isObject(s) && typeof s.ref === 'string' && typeof s.id === 'string' && (s.kind === 'qr' || s.kind === 'consumption'),
  );
  return out.length > 0 ? out : undefined;
}

function cleanFacts(v: unknown): AssistantFact[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((f): f is AssistantFact => isObject(f) && typeof f.tool === 'string' && typeof f.period === 'string');
  return out.length > 0 ? out : undefined;
}

/**
 * Ham JSON → güvenli mesaj dizisi. Geçersiz öğeler atlanır; kimliksiz (eski) öğeler
 * `legacy-<sıra>` alır (aynı satır her okumada aynı kimliği üretir → değerlendirme çalışır).
 */
export function normalizeStoredMessages(raw: unknown, fallbackIso = new Date(0).toISOString()): AssistantMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantMessage[] = [];
  raw.forEach((item, index) => {
    if (!isObject(item)) return;
    const role = item.role;
    if (role !== 'user' && role !== 'assistant') return;
    const content = typeof item.content === 'string' ? item.content : '';
    const status: MessageStatus | undefined =
      item.status === 'stopped' || item.status === 'error' || item.status === 'complete' ? item.status : undefined;
    if (!content.trim() && status !== 'stopped') return;
    const msg: AssistantMessage = {
      id: isSafeId(item.id) ? item.id : `legacy-${index}`,
      role,
      content,
      createdAt: toIso(item.createdAt ?? item.timestamp, fallbackIso),
    };
    if (role === 'assistant') {
      msg.status = status ?? 'complete';
      const facts = cleanFacts(item.facts);
      const sources = cleanSources(item.sources);
      if (facts) msg.facts = facts;
      if (sources) msg.sources = sources;
      if (item.rating === 1 || item.rating === -1) msg.rating = item.rating;
      if (typeof item.model === 'string') msg.model = item.model;
    }
    if (isAssistantPeriod(item.period)) msg.period = item.period;
    out.push(msg);
  });
  return out;
}

export function normalizeContext(raw: unknown): ConversationContext {
  if (!isObject(raw)) return { surface: null, period: DEFAULT_ASSISTANT_PERIOD, pinned: false };
  return {
    surface: typeof raw.surface === 'string' ? raw.surface : null,
    period: isAssistantPeriod(raw.period) ? raw.period : DEFAULT_ASSISTANT_PERIOD,
    pinned: raw.pinned === true,
  };
}

/** Mevcut bağlamı (bilinmeyen anahtarlar dahil) koruyarak günceller. */
export function mergeContext(raw: unknown, patch: Partial<Omit<ConversationContext, 'surface'>>): Record<string, unknown> {
  const base = isObject(raw) ? { ...raw } : {};
  base.surface = ASSISTANT_SURFACE;
  if (patch.period !== undefined) base.period = patch.period;
  if (patch.pinned !== undefined) base.pinned = patch.pinned;
  return base;
}

/** Sorudan başlık: boşluklar sadeleşir, kelime sınırında kesilir. */
export function deriveTitle(question: string, max = 80): string {
  const s = question.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s || '…';
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function cleanTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

/** Saklama sınırı: en eski turlar düşer (kullanıcı mesajıyla başlayacak şekilde). */
export function capMessages(messages: AssistantMessage[], max = MAX_STORED_MESSAGES): { messages: AssistantMessage[]; truncated: boolean } {
  if (messages.length <= max) return { messages, truncated: false };
  let start = messages.length - max;
  while (start < messages.length && messages[start].role !== 'user') start++;
  return { messages: messages.slice(start), truncated: true };
}

export function appendTurn(existing: AssistantMessage[], user: AssistantMessage, assistant: AssistantMessage): AssistantMessage[] {
  return capMessages([...existing, user, assistant]).messages;
}

/**
 * Yeniden üret: son kullanıcı mesajı ve ondan önceki geçmiş. Son kullanıcı mesajından sonraki
 * asistan yanıt(lar)ı düşürülecek kısımdır. Kullanıcı mesajı yoksa null.
 */
export function splitForRegenerate(messages: AssistantMessage[]): { history: AssistantMessage[]; user: AssistantMessage } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return { history: messages.slice(0, i), user: messages[i] };
  }
  return null;
}

/** Son kullanıcı mesajından sonrasını yeni yanıtla değiştirir. */
export function replaceLastAnswer(messages: AssistantMessage[], assistant: AssistantMessage): AssistantMessage[] | null {
  const split = splitForRegenerate(messages);
  if (!split) return null;
  return capMessages([...split.history, split.user, assistant]).messages;
}

/** LLM geçmişi: yalnız rol + metin, boş/başarısız turlar hariç, son N mesaj. */
export function historyForModel(messages: AssistantMessage[], max = 12): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.content.trim().length > 0 && m.status !== 'error')
    .slice(-max)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function setMessageRating(messages: AssistantMessage[], messageId: string, rating: 1 | -1 | null): AssistantMessage[] | null {
  let found = false;
  const next = messages.map((m) => {
    if (m.id !== messageId || m.role !== 'assistant') return m;
    found = true;
    const copy: AssistantMessage = { ...m };
    if (rating === null) delete copy.rating;
    else copy.rating = rating;
    return copy;
  });
  return found ? next : null;
}

const CITE_RE = /\[K(\d{1,3})\]/g;

/** Yanıt metnindeki `[K3]` atıflarının sıralı ve tekil listesi. */
export function citedRefs(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of content.matchAll(CITE_RE)) {
    const ref = `K${m[1]}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}

/**
 * Kaynakları sıralar: önce metinde atıf yapılanlar (atıf sırasıyla), sonra incelenen diğerleri.
 * Metinde var olmayan bir kaynağa yapılan atıf (uydurma `[K9]`) metinden temizlenir.
 */
export function finalizeCitations(content: string, sources: AssistantSource[]): { content: string; sources: AssistantSource[] } {
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const cleaned = content.replace(CITE_RE, (full, n: string) => (byRef.has(`K${n}`) ? full : ''));
  const cited = citedRefs(cleaned);
  const citedSet = new Set(cited);
  const ordered = [
    ...cited.map((r) => byRef.get(r)).filter((s): s is AssistantSource => !!s),
    ...sources.filter((s) => !citedSet.has(s.ref)),
  ];
  return { content: cleaned.replace(/[ \t]{2,}/g, ' '), sources: ordered };
}
