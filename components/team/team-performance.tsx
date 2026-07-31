'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, BarChart3, Trophy, Clock, AlertTriangle, CheckCircle2, Medal } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

type Row = {
  id: string; name: string | null; email: string; image: string | null;
  role: string | null; department: string | null;
  total: number; done: number; open: number; overdue: number; completionRate: number;
  estimateMin: number; spentMin: number; avgCycleHours: number | null;
};

function fmtHours(min: number): string {
  const h = min / 60;
  return h < 1 ? `${min}dk` : `${Math.round(h * 10) / 10}s`;
}

const MEDAL = ['text-amber-400', 'text-slate-300', 'text-orange-400'];

/** Üye Performans Paneli — görev/süre/yük metrikleri + liderlik. */
export function TeamPerformance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team/performance', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setRows(json.members);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="size-6 animate-spin" /> Yükleniyor…</div>;
  }
  if (rows.length === 0) {
    return <EmptyState icon={BarChart3} title="Performans verisi yok" description="Ekip üyelerine görev atandıkça metrikler burada oluşur." />;
  }

  const maxDone = Math.max(1, ...rows.map((r) => r.done));
  const totals = rows.reduce((a, r) => ({ done: a.done + r.done, open: a.open + r.open, overdue: a.overdue + r.overdue, spent: a.spent + r.spentMin }), { done: 0, open: 0, overdue: 0, spent: 0 });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Genel özet */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Toplam Biten', value: totals.done, icon: CheckCircle2, color: 'text-emerald-500' },
            { label: 'Açık Görev', value: totals.open, icon: BarChart3, color: 'text-amber-500' },
            { label: 'Gecikmiş', value: totals.overdue, icon: AlertTriangle, color: 'text-red-500' },
            { label: 'Toplam Süre', value: fmtHours(totals.spent), icon: Clock, color: 'text-primary' },
          ].map((s) => (
            <Card key={s.label}><CardContent className="flex items-center gap-3 p-4">
              <s.icon className={cn('h-5 w-5', s.color)} />
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-[11px] text-muted-foreground">{s.label}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Liderlik tablosu */}
        <Card><CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Trophy className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Ekip Liderlik Tablosu</h3>
          </div>
          <div className="divide-y divide-border/40">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-center">
                  {i < 3 ? <Medal className={cn('mx-auto h-5 w-5', MEDAL[i])} /> : <span className="text-sm font-semibold text-muted-foreground">{i + 1}</span>}
                </span>
                <Avatar className="h-9 w-9">
                  {r.image ? <AvatarImage src={r.image} /> : null}
                  <AvatarFallback>{getInitials(r.name || r.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.name || r.email.split('@')[0]}
                    {r.role === 'yonetici' && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">Yönetici</span>}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={(r.done / maxDone) * 100} className="h-1.5 max-w-[140px]" />
                    <span className="text-[11px] text-muted-foreground">%{r.completionRate} tamamlanma</span>
                  </div>
                </div>
                <div className="hidden items-center gap-4 text-center text-xs sm:flex">
                  <Tooltip><TooltipTrigger asChild><div><p className="font-bold text-emerald-500">{r.done}</p><p className="text-[10px] text-muted-foreground">bitti</p></div></TooltipTrigger><TooltipContent>Tamamlanan görev</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><div><p className="font-bold text-amber-500">{r.open}</p><p className="text-[10px] text-muted-foreground">açık</p></div></TooltipTrigger><TooltipContent>Açık görev</TooltipContent></Tooltip>
                  {r.overdue > 0 && <Tooltip><TooltipTrigger asChild><div><p className="font-bold text-red-500">{r.overdue}</p><p className="text-[10px] text-muted-foreground">geç</p></div></TooltipTrigger><TooltipContent>Gecikmiş görev</TooltipContent></Tooltip>}
                  <Tooltip><TooltipTrigger asChild><div><p className="font-bold text-primary">{fmtHours(r.spentMin)}</p><p className="text-[10px] text-muted-foreground">süre</p></div></TooltipTrigger><TooltipContent>Harcanan toplam süre</TooltipContent></Tooltip>
                  {r.avgCycleHours != null && <Tooltip><TooltipTrigger asChild><div><p className="font-bold text-slate-400">{r.avgCycleHours}s</p><p className="text-[10px] text-muted-foreground">döngü</p></div></TooltipTrigger><TooltipContent>Ortalama tamamlama süresi</TooltipContent></Tooltip>}
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>
    </TooltipProvider>
  );
}
