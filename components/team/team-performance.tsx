'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, BarChart3, Trophy, Clock, AlertTriangle, CheckCircle2, Medal, Timer, Gauge, TrendingUp, TrendingDown } from 'lucide-react';
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

/**
 * Tahmini vs harcanan sapma hesabı.
 * deviationPct > 0 → tahmini aştı (kötü/kırmızı); ≤ 0 → tahmin içinde (iyi/yeşil).
 * estimateMin=0 ise sapma hesaplanamaz (bölme sıfır) → null.
 */
function deviation(estimateMin: number, spentMin: number): number | null {
  if (estimateMin <= 0) return null;
  return Math.round(((spentMin - estimateMin) / estimateMin) * 100);
}

/** Üye Performans Paneli — görev/süre/yük metrikleri + tahmin/harcanan verimlilik + liderlik. */
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

  // Zaman/verimlilik geneli: toplam tahmini vs toplam harcanan.
  const totalEstimate = rows.reduce((s, r) => s + r.estimateMin, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spentMin, 0);
  // Verimlilik = tahmin / harcanan (%): 100 = birebir, >100 = tahminden hızlı, <100 = yavaş.
  const efficiencyPct = totalSpent > 0 && totalEstimate > 0 ? Math.round((totalEstimate / totalSpent) * 100) : null;
  const overallDev = deviation(totalEstimate, totalSpent);
  // En büyük tahmin/harcanan tabanı — üye barlarını ortak ölçeğe getirmek için.
  const maxTimeBase = Math.max(1, ...rows.map((r) => Math.max(r.estimateMin, r.spentMin)));

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

        {/* ── ZAMAN & VERİMLİLİK ÖZETİ ─────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
            <Gauge className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Zaman &amp; Verimlilik</h3>
          </div>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Timer className="h-3.5 w-3.5" /><span className="text-[11px]">Toplam Tahmini</span></div>
                <p className="mt-1 text-lg font-bold">{fmtHours(totalEstimate)}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /><span className="text-[11px]">Toplam Harcanan</span></div>
                <p className="mt-1 text-lg font-bold">{fmtHours(totalSpent)}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Gauge className="h-3.5 w-3.5" /><span className="text-[11px]">Verimlilik</span></div>
                <p className={cn('mt-1 text-lg font-bold',
                  efficiencyPct == null ? 'text-muted-foreground'
                    : efficiencyPct >= 100 ? 'text-emerald-500' : 'text-red-500')}>
                  {efficiencyPct == null ? '—' : `%${efficiencyPct}`}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-[11px]">Toplam Tamamlanan</span></div>
                <p className="mt-1 text-lg font-bold">{totals.done}</p>
              </div>
            </div>

            {/* Genel tahmin vs harcanan barı */}
            {totalEstimate > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Genel tahmin vs harcanan</span>
                  {overallDev != null && (
                    <span className={cn('inline-flex items-center gap-1 font-semibold',
                      overallDev > 0 ? 'text-red-500' : 'text-emerald-500')}>
                      {overallDev > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {overallDev > 0 ? `+%${overallDev} sapma` : overallDev < 0 ? `%${Math.abs(overallDev)} altında` : 'birebir'}
                    </span>
                  )}
                </div>
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {/* tahmin çizgisi */}
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: '100%' }} />
                  {/* harcanan (tahmine oranla) */}
                  <div
                    className={cn('absolute inset-y-0 left-0 rounded-full', overallDev != null && overallDev > 0 ? 'bg-red-500' : 'bg-emerald-500')}
                    style={{ width: `${Math.min(100, (totalSpent / totalEstimate) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Tahmin: {fmtHours(totalEstimate)}</span>
                  <span>Harcanan: {fmtHours(totalSpent)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── ÜYE BAZLI TAHMİN vs HARCANAN ─────────────────────────── */}
        <Card><CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Timer className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Tahmini vs Harcanan (üye bazlı)</h3>
          </div>
          <div className="divide-y divide-border/40">
            {rows.filter((r) => r.estimateMin > 0 || r.spentMin > 0).map((r) => {
              const dev = deviation(r.estimateMin, r.spentMin);
              const over = dev != null && dev > 0;
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {r.image ? <AvatarImage src={r.image} /> : null}
                        <AvatarFallback className="text-[10px]">{getInitials(r.name || r.email)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-xs font-medium">{r.name || r.email.split('@')[0]}</span>
                    </div>
                    {dev == null ? (
                      <span className="text-[10px] text-muted-foreground">tahmin yok</span>
                    ) : (
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                        over ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
                        {over ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {over ? `+%${dev}` : dev < 0 ? `%${Math.abs(dev)} altı` : 'birebir'}
                      </span>
                    )}
                  </div>
                  {/* İki bar: tahmin (gri) üstünde harcanan (renkli), ortak ölçek. */}
                  <div className="space-y-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${(r.estimateMin / maxTimeBase) * 100}%` }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Tahmini: {fmtHours(r.estimateMin)}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${(r.spentMin / maxTimeBase) * 100}%` }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Harcanan: {fmtHours(r.spentMin)}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>tahmin: {fmtHours(r.estimateMin)}</span>
                    <span>harcanan: {fmtHours(r.spentMin)}</span>
                  </div>
                </div>
              );
            })}
            {rows.filter((r) => r.estimateMin > 0 || r.spentMin > 0).length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Henüz süre verisi yok. Görevlere tahmini/harcanan süre girildikçe burada görünür.</p>
            )}
          </div>
        </CardContent></Card>

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
