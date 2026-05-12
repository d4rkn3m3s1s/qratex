'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime } from '@/lib/utils';

type JourneyStep = {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
  detail?: string;
};

export default function CustomerFeedbackJourneyPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [meta, setMeta] = useState<{ businessName: string; rating: number; createdAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/customer/feedbacks/${id}/journey`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Yüklenemedi');
        if (cancelled) return;
        setSteps(data.steps);
        setMeta({
          businessName: data.feedback.businessName,
          rating: data.feedback.rating,
          createdAt: data.feedback.createdAt,
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Hata');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="space-y-6 pb-10 max-w-lg mx-auto">
      <Button variant="ghost" size="sm" asChild className="w-fit -mb-2 touch-manipulation">
        <Link href="/customer/feedbacks">
          <ArrowLeft className="h-4 w-4 shrink-0 mr-2" />
          Geri bildirimlerim
        </Link>
      </Button>
      <div className="mb-2 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-balance">Geri bildirim yolculuğu</h1>
        <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">İşletmede durumunuzun özeti</p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      )}
      {err && !loading && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {!loading && !err && meta && (
        <>
          <Card>
            <CardContent className="pt-6 text-sm space-y-1">
              <p className="font-medium">{meta.businessName}</p>
              <p className="text-muted-foreground">
                Puan: {meta.rating}/5 · Gönderim: {formatRelativeTime(meta.createdAt)}
              </p>
            </CardContent>
          </Card>

          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.key} className="flex gap-3">
                <div className="flex flex-col items-center pt-0.5">
                  {s.done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                  )}
                  {i < steps.length - 1 && <span className="w-px flex-1 min-h-[24px] bg-border mt-1" />}
                </div>
                <div className={cn('flex-1 rounded-xl border p-3', s.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/60')}>
                  <p className="font-medium text-sm">{s.label}</p>
                  {s.at && <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(s.at)}</p>}
                  {s.detail && s.key === 'dealer_replied' && (
                    <p className="text-xs mt-2 text-muted-foreground border-t border-border/50 pt-2">{s.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
