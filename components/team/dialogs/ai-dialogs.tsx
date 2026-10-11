'use client';

import { useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { ErrorState, InlineError, SkeletonBlock } from '@/components/states';
import { weekKeyLabel } from '@/lib/team-week';
import { errorMessage, teamFetch } from '../lib/api';
import { API } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { useTeamCopy } from '../copy';

type Turn = { q: string; a: string };

/**
 * AI'ya sor — tüm ekip; bağlam sunucuda görünürlük kapsamıyla sınırlı. Soru, istek başarısız
 * olursa kutuda kalır (denetim #8: soru istekten önce siliniyordu); önceki 4 tur bağlam olarak
 * gider (takip soruları çalışır).
 */
export function AiAskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tx = useTeamCopy();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await teamFetch<{ answer: string; basedOn: number }>(`${API}/ai-qa`, { method: 'POST', json: { question: q, history: turns.slice(-4) } });
      setTurns((t) => [...t, { q, a: res.answer }]);
      setQuestion('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden /> AI'ya sor
          </DialogTitle>
          <DialogDescription>{tx.aiAskDesc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3" aria-live="polite">
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['Bu hafta kimin en çok açık işi var?', 'Geciken görevleri listele', 'Onay bekleyen kaç görev var?'].map((s) => (
                <Button key={s} type="button" size="sm" variant="outline" className="h-9" onClick={() => setQuestion(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="qx-small ml-auto w-fit max-w-[85%] rounded-card bg-brand-subtle px-3 py-2 text-fg">{t.q}</p>
              <p className="qx-small max-w-[95%] whitespace-pre-wrap rounded-card border border-subtle bg-surface-2 px-3 py-2 text-fg">{t.a}</p>
            </div>
          ))}
          {busy && <SkeletonBlock className="h-16" />}
          {error && <InlineError variant="banner">{error}</InlineError>}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            rows={2}
            maxLength={500}
            placeholder="Sorunu yaz (Enter ile gönder)"
            aria-label="Soru"
          />
          <Button type="submit" className="h-11 shrink-0 gap-1.5" disabled={busy || question.trim().length < 3}>
            <Send className="h-4 w-4" aria-hidden /> Sor
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Summary = { summary: string | null; stats: { total: number; done: number; review: number; overdue: number }; weekKey?: string };

/** AI haftalık özet (yönetici) — sayılar koddan, anlatım LLM'den; arşiv hariç. */
export function AiSummaryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tx = useTeamCopy();
  const { weekKey } = useWorkspace();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await teamFetch<Summary>(`${API}/ai`, { method: 'POST', json: { op: 'weekly_summary', weekKey } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open) void run();
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden /> Haftalık özet
          </DialogTitle>
          <DialogDescription>{weekKeyLabel(weekKey)}</DialogDescription>
        </DialogHeader>
        {busy && !data && <SkeletonBlock className="h-40" />}
        {error != null && <ErrorState title="Özet üretilemedi" description={errorMessage(error)} onRetry={run} />}
        {data && (
          <div className="space-y-3" aria-live="polite">
            <MetricGrid cols={4}>
              <MetricTile label="Toplam" metric={{ value: data.stats.total }} size="compact" />
              <MetricTile label="Biten" metric={{ value: data.stats.done }} tone="success" size="compact" />
              <MetricTile label="Onayda" metric={{ value: data.stats.review }} tone="info" size="compact" />
              <MetricTile label="Geciken" metric={{ value: data.stats.overdue }} tone={data.stats.overdue ? 'danger' : 'neutral'} size="compact" />
            </MetricGrid>
            {data.summary ? (
              <p className="qx-body whitespace-pre-wrap text-fg">{data.summary}</p>
            ) : (
              <p className="qx-small text-fg-muted">{tx.aiNoTasks}</p>
            )}
            <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={run}>
              {busy ? 'Yenileniyor…' : 'Yeniden üret'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
