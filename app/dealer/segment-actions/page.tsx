'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Target, ArrowRight, Loader2, Users } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type SegmentAction = {
  label: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  endpoint: string;
  icon: string;
};
type SegmentSummary = {
  name: string;
  color: string;
  count: number;
  totalSpent: number;
  avgSpent: number;
  avgChurn: number | null;
  action: SegmentAction | null;
};

const priorityRing: Record<string, string> = {
  high: 'ring-red-400/40 dark:ring-red-500/30',
  medium: 'ring-amber-400/40 dark:ring-amber-500/30',
  low: 'ring-border',
};
const priorityBadge: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
};
const priorityLabel: Record<string, string> = { high: 'Acil', medium: 'Önemli', low: 'İzle' };

const money = (n: number) => `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function SegmentActionCenterPage() {
  const [segments, setSegments] = useState<SegmentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dealer/segment-actions');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setSegments(data.segments ?? []);
      setTotal(data.totalCustomers ?? 0);
      setNote(data.note);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Segmentler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Aksiyonu uygula: ilgili mevcut endpoint'e POST. Endpoint'ler kampanya taslağı üretir;
  // dealer'ı sonucuna yönlendirmek yerine burada kısa bir onay gösteririz.
  const applyAction = async (seg: SegmentSummary) => {
    if (!seg.action) return;
    setApplying(seg.name);
    try {
      const res = await fetch(seg.action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment: seg.name, source: 'segment-action-center' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Aksiyon uygulanamadı');
      toast.success(`${seg.name}: ${seg.action.label} hazırlandı ✓`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aksiyon uygulanamadı');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<Target className="text-white" />}
        title="Segment Aksiyon Merkezi"
        description="Müşterilerin hangi segmentte olduğunu gör, her biri için önerilen aksiyonu tek tıkla uygula."
      />

      {note && (
        <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-500/5">
          <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300">{note}</CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        Toplam <span className="font-semibold text-foreground">{total}</span> müşteri
        {!loading && <span>· {segments.length} segment</span>}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
      ) : segments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/50" />
            <p className="font-semibold">Henüz segment verisi yok</p>
            <p className="text-sm text-muted-foreground">Müşteri tüketimi biriktikçe segmentler otomatik oluşur (günlük hesaplama).</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {segments.map((seg) => {
            const pr = seg.action?.priority ?? 'low';
            return (
              <Card key={seg.name} className={`ring-1 ${priorityRing[pr]} transition-shadow hover:shadow-md`}>
                <CardContent className="space-y-4 p-5">
                  {/* Başlık: segment adı + renk + müşteri sayısı */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: seg.color }} />
                      <div>
                        <p className="font-bold leading-tight">{seg.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {seg.count} müşteri · ort. {money(seg.avgSpent)}
                        </p>
                      </div>
                    </div>
                    {seg.action && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityBadge[pr]}`}>
                        {priorityLabel[pr]}
                      </span>
                    )}
                  </div>

                  {/* Metrikler */}
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Toplam değer</p>
                      <p className="font-semibold">{money(seg.totalSpent)}</p>
                    </div>
                    {seg.avgChurn != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Ort. kayıp riski</p>
                        <p className="font-semibold text-red-600 dark:text-red-400">%{Math.round(seg.avgChurn * 100)}</p>
                      </div>
                    )}
                  </div>

                  {/* Önerilen aksiyon */}
                  {seg.action ? (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                        <span>{seg.action.icon}</span>
                        {seg.action.label}
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">{seg.action.rationale}</p>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={applying === seg.name}
                        onClick={() => applyAction(seg)}
                      >
                        {applying === seg.name ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            {seg.action.label}
                            <ArrowRight className="ml-1 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Bu segment için otomatik aksiyon önerisi yok.</p>
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
