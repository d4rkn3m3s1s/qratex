'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Send, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ds/page';
import { TONE_CALLOUT } from '@/components/states/tone';
import { useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ASSISTANT_SUGGESTIONS, PERIOD_LABEL } from '@/lib/admin-ai-ops/contract';
import { askAssistant, errorText } from './api';
import { useAiOps } from './hooks';
import { fmtTime } from './parts';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; at: string; sources?: string[] };

/** **kalın** ve basit listeleri güvenli biçimde (HTML enjekte etmeden) çizer. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <L key={`l${blocks.length}`} className={cn('my-1 space-y-0.5 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </L>
    );
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ''))}</p>);
  }
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

let seq = 0;
const nid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function AssistantTab() {
  const { period } = useAiOps();
  const reduce = useReducedMotionPref();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; question: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    // Yalnız sohbet kabını kaydır; sayfa zıplamaz (B10).
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, loading, reduce]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    const history = messages.slice(-12).map(({ role, content }) => ({ role, content }));
    const userMsg: Msg = { id: nid(), role: 'user', content: q, at: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const r = await askAssistant({ question: q, period, history });
      setMessages((m) => [...m, { id: nid(), role: 'assistant', content: r.answer, at: r.generatedAt, sources: r.sources }]);
    } catch (e) {
      // Hata yanıt sayılmaz ve geçmişe girmez (B6): kullanıcı mesajı geri alınır, tekrar denenebilir.
      setMessages((m) => m.filter((x) => x.id !== userMsg.id));
      setError({ message: errorText(e, 'Asistan yanıt veremedi.'), question: q });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard
      title="AI asistanı"
      description={`Sorular ${PERIOD_LABEL[period].toLocaleLowerCase('tr-TR')} verisiyle (toplamlar, bayi risk sıralaması, temalar, son yorumlar) yanıtlanır. Her soru bir AI çağrısıdır ve günlük platform kotasından düşer. Sohbet bu sekmede tutulur, kaydedilmez.`}
      icon={<Bot />}
      actions={
        messages.length ? (
          <Button variant="ghost" size="sm" className="min-h-[44px] sm:min-h-9" onClick={() => { setMessages([]); setError(null); }}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Yeni sohbet
          </Button>
        ) : null
      }
    >
      <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Asistan sohbeti" className="max-h-[28rem] min-h-[12rem] space-y-3 overflow-y-auto rounded-lg border border-border bg-surface-0 p-3">
        {messages.length === 0 && !loading ? (
          <div className="py-6 text-center">
            <p className="text-sm text-fg-muted">Önerilen sorular:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {ASSISTANT_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="min-h-[44px] rounded-full border border-border bg-surface-1 px-3 py-1.5 text-sm text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm', msg.role === 'user' ? 'bg-brand text-brand-fg' : 'border border-border bg-surface-1 text-fg')}>
              <span className="sr-only">{msg.role === 'user' ? 'Siz' : 'Asistan'}: </span>
              {msg.role === 'assistant' ? <RichText text={msg.content} /> : <p className="whitespace-pre-wrap">{msg.content}</p>}
              {msg.sources?.length ? (
                <p className="mt-2 flex flex-wrap gap-1 text-[11px] text-fg-muted">
                  <span>Kaynak:</span>
                  {msg.sources.map((s) => (
                    <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5">{s}</span>
                  ))}
                </p>
              ) : null}
              <time dateTime={msg.at} className={cn('mt-1 block text-[11px]', msg.role === 'user' ? 'text-brand-fg/80' : 'text-fg-muted')}>
                {fmtTime(msg.at)}
              </time>
            </div>
          </div>
        ))}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Yanıt hazırlanıyor…
          </p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className={cn('mt-3 flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between', TONE_CALLOUT.danger)}>
          <span>{error.message}</span>
          <Button size="sm" variant="outline" className="min-h-[44px] sm:min-h-8" onClick={() => send(error.question)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Tekrar dene
          </Button>
        </div>
      ) : null}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Asistana sorunuz</span>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="Örn. Bu hafta en çok şikâyet hangi konuda?"
            disabled={loading}
          />
        </label>
        <Button type="submit" disabled={loading || input.trim().length < 2} className="min-h-[44px]" aria-label="Soruyu gönder">
          <Send className="h-4 w-4" aria-hidden />
          <span className="ml-1.5 hidden sm:inline">Gönder</span>
        </Button>
      </form>
    </SectionCard>
  );
}
