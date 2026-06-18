'use client';

import { useEffect, useState } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Sparkles } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type Brief = {
  id: string;
  weekStart: string;
  topThemes: { theme: string; count: number }[] | null;
  recommendedAction: string;
  createdAt: string;
};

export default function DealerWeeklyBriefPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/weekly-brief')
      .then((r) => r.json())
      .then((d) => setBriefs(Array.isArray(d.briefs) ? d.briefs : []))
      .catch(() => toast.error('Haftalık özetler yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="Haftalık Özetler"
        description="Her hafta otomatik üretilen AI özeti — öne çıkan temalar ve önerilen aksiyon"
        icon={<CalendarDays className="text-white" />}
      />
      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Yükleniyor...</CardContent>
        </Card>
      ) : briefs.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Henüz haftalık özet yok. İlk özet, yeterli veri biriktiğinde Pazartesi sabahı otomatik oluşturulur.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {briefs.map((b) => {
            const themes = Array.isArray(b.topThemes) ? b.topThemes : [];
            const weekStart = new Date(b.weekStart);
            const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
            return (
              <Card key={b.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {weekStart.toLocaleDateString('tr-TR')} – {weekEnd.toLocaleDateString('tr-TR')}
                  </CardTitle>
                  <CardDescription>Haftalık otomatik AI özeti</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg border bg-primary/5 p-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm">{b.recommendedAction}</p>
                  </div>
                  {themes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {themes.map((t) => (
                        <span key={t.theme} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                          {t.theme} <span className="text-muted-foreground">({t.count})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
