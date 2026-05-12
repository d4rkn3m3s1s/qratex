'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Trophy, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RunItem {
  id: string;
  goal: string;
  winnerAgent: string | null;
  status: string;
  createdAt: string;
  confidence: number | null;
}

export default function AgentCouncilHistoryPage() {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/agents/runs?take=50');
        const data = await res.json();
        if (res.ok && data.success) setRuns(data.runs ?? []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Konsey geçmişi"
        description="Kayıtlı çoklu ajan koşuları; bir kayda tıklayınca ana konsey sayfasında tam transkript ve karar açılır."
        icon={<CalendarClock className="text-white" />}
        actions={
          <Button asChild size="sm" variant="secondary" className="gap-2">
            <Link href="/admin/agent-council">
              <Sparkles className="h-4 w-4" />
              Yeni konsey oturumu
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="council-history-heading" aria-busy={loading}>
        <Card className="rounded-none border-4 border-black dark:border-zinc-700">
          <CardHeader>
            <CardTitle id="council-history-heading" className="font-mono flex items-center gap-2">
              <CalendarClock className="h-5 w-5" aria-hidden /> Son koşular
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <p className="text-sm text-muted-foreground" role="status">
                Yükleniyor…
              </p>
            )}
            {!loading && runs.length === 0 && (
              <p className="text-sm text-muted-foreground">Kayıt yok.</p>
            )}
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/admin/agent-council?runId=${run.id}`}
                className="block border p-3 rounded-none hover:bg-muted/40"
                aria-label={`${run.goal}, durum ${run.status}, ${new Date(run.createdAt).toLocaleString('tr-TR')}`}
              >
                <p className="font-medium">{run.goal}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{run.status}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3 w-3" aria-hidden /> {run.winnerAgent ?? '—'}
                  </span>
                  <span>Güven: {run.confidence != null ? `${Math.round(run.confidence * 100)}%` : '—'}</span>
                  <span>{new Date(run.createdAt).toLocaleString('tr-TR')}</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
