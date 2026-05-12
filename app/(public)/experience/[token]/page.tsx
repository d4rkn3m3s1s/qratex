'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

type Payload = {
  dealerLabel: string;
  caption: string | null;
  mood: string;
  viewCount: number;
  disclaimer: string;
};

export default function PublicExperienceSharePage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Geçersiz link');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/experience-share/${token}`, { cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Yüklenemedi');
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Hata');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted-foreground animate-pulse">
        Yükleniyor…
      </div>
    );
  }

  const moodLabel =
    data.mood === 'great' ? 'Harika' : data.mood === 'ok' ? 'Tamam' : 'Güzel';

  return (
    <div className="mx-auto max-w-lg px-4 py-12 space-y-6">
      <div className="text-center space-y-2">
        <Sparkles className="h-10 w-10 mx-auto text-primary" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Bu hafta şunu denedik</h1>
        <p className="text-sm text-muted-foreground">{data.disclaimer}</p>
      </div>

      <Card className="border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">{data.dealerLabel}</CardTitle>
          <CardDescription>Anonim deneyim kartı — kişisel bilgi paylaşılmaz.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">{moodLabel}</Badge>
            <span className="text-xs text-muted-foreground">{data.viewCount} görüntüleme</span>
          </div>
          {data.caption ? (
            <p className="text-base leading-relaxed">{data.caption}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Kısa not eklenmemiş — yine de birlikte denemek için davet linki.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
