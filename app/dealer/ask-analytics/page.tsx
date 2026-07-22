'use client';

import { useState } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircleQuestion, Loader2, Sparkles, Send } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type Grounding = {
  thisWeekCount: number;
  thisAvgRating: number | null;
  prevAvgRating: number | null;
  topThemes: { theme: string; count: number }[];
  churnHighCount: number;
  relevantCount: number;
};

const SUGGESTIONS = [
  'Geçen haftaya göre puanım nasıl değişti, neden?',
  'Müşteriler en çok neden şikâyet ediyor?',
  'Kaybetme riski yüksek müşterilerde ortak tema ne?',
  'Bu hafta hangi konuya öncelik vermeliyim?',
];

export default function DealerAskAnalyticsPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [grounding, setGrounding] = useState<Grounding | null>(null);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (text.length < 3) {
      toast.error('Lütfen bir soru yazın');
      return;
    }
    setLoading(true);
    setAnswer(null);
    setGrounding(null);
    try {
      const res = await fetch('/api/dealer/ask-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analiz yapılamadı');
      setAnswer(data.answer);
      setGrounding(data.grounding ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analiz yapılamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="Veriye Sor"
        description="Doğal dille sor; AI işletme verinden (sentiment, tema, churn, trend) sentezleyip yanıtlar"
        icon={<MessageCircleQuestion className="text-white" />}
      />

      {/* AI merkezi bağlantısı: sürekli sohbet için AI Sohbet'e geçiş */}
      <a
        href="/dealer/ai-chat"
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Sparkles className="h-4 w-4" />
        Sürekli sohbet mi istiyorsun? AI Sohbet'e geç →
      </a>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && ask()}
            placeholder="Örn: Geçen hafta puanım neden düştü?"
            disabled={loading}
          />
          <Button onClick={() => ask()} disabled={loading || question.trim().length < 3}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Sor
          </Button>
        </CardContent>
      </Card>

      {!answer && !loading && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuestion(s);
                ask(s);
              }}
              className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verileriniz analiz ediliyor...
          </CardContent>
        </Card>
      )}

      {answer && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Yanıt
            </CardTitle>
            <CardDescription>Yalnızca gerçek işletme verinize dayanır.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
            {grounding && (
              <div className="flex flex-wrap gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-1">Son 7g: {grounding.thisWeekCount} geri bildirim</span>
                {grounding.thisAvgRating != null && (
                  <span className="rounded bg-muted px-2 py-1">
                    Ort: {grounding.thisAvgRating.toFixed(2)}★
                    {grounding.prevAvgRating != null &&
                      ` (önceki ${grounding.prevAvgRating.toFixed(2)}★)`}
                  </span>
                )}
                {grounding.churnHighCount > 0 && (
                  <span className="rounded bg-red-500/10 px-2 py-1 text-red-600">
                    {grounding.churnHighCount} yüksek kayıp riski
                  </span>
                )}
                {grounding.topThemes.slice(0, 4).map((t) => (
                  <span key={t.theme} className="rounded bg-muted px-2 py-1">
                    {t.theme} ({t.count})
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
