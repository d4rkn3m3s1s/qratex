'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';

/** AI ile haftalık ekip özeti diyaloğu. */
export function AiSummaryDialog({ open, onOpenChange, weekKey }: {
  open: boolean; onOpenChange: (o: boolean) => void; weekKey: string;
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/team/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'weekly_summary', weekKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error || 'Özet alınamadı'); return; }
      setSummary(json.summary);
    } catch { setError('Bağlantı hatası'); }
    finally { setLoading(false); }
  }, [weekKey]);

  useEffect(() => { if (open) { setSummary(null); generate(); } }, [open, generate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-500"><Sparkles className="h-5 w-5" /></span>
            AI Haftalık Özet
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[140px] py-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Ekip verisi analiz ediliyor…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={generate}><RefreshCw className="mr-1.5 h-4 w-4" /> Tekrar dene</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 p-4 text-sm leading-relaxed">
                {summary}
              </div>
              <Button variant="ghost" size="sm" onClick={generate} className="text-muted-foreground">
                <RefreshCw className="mr-1.5 h-4 w-4" /> Yeniden oluştur
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
