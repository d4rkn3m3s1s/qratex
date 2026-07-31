'use client';

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Send, MessageCircleQuestion } from 'lucide-react';

const SUGGESTIONS = [
  'Gecikmiş görevler kimde?',
  'Bu hafta en çok kim görev tamamladı?',
  'Hangi departmanda en fazla açık görev var?',
  'Yüksek öncelikli açık görevler neler?',
];

type QA = { question: string; answer: string };

/** AI Q&A — ekip verisine doğal dille soru sor (Notion AI tarzı). */
export function AiQaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QA[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [history, loading]);

  const ask = async (q: string) => {
    const query = q.trim();
    if (query.length < 3 || loading) return;
    setLoading(true); setError(null); setQuestion('');
    try {
      const res = await fetch('/api/admin/team/ai-qa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error || 'Yanıt alınamadı'); return; }
      setHistory((h) => [...h, { question: query, answer: json.answer }]);
    } catch { setError('Bağlantı hatası'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader className="border-b border-border/50 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-500"><Sparkles className="h-5 w-5" /></span>
            AI'ya Sor
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-2">
          {history.length === 0 && !loading && (
            <div className="space-y-3 py-4">
              <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                <MessageCircleQuestion className="h-10 w-10 opacity-40" />
                <p className="text-sm">Ekip görevlerine dair her şeyi sorabilirsin.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {history.map((qa, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{qa.question}</p>
              </div>
              <div className="flex gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-500"><Sparkles className="h-3.5 w-3.5" /></span>
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2 text-sm leading-relaxed">{qa.answer}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-500"><Sparkles className="h-3.5 w-3.5" /></span>
              <p className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Düşünüyor…</p>
            </div>
          )}
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-border/50 pt-3">
          <Input
            placeholder="Bir soru yaz…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(question); }}
            className="h-10"
            autoFocus
          />
          <Button className="h-10" onClick={() => ask(question)} disabled={loading || question.trim().length < 3}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
