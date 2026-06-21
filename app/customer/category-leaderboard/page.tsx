'use client';

import { useEffect, useState, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Star, Heart, Medal } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';

type Cat = { category: string; dealerCount: number };
type Row = { rank: number; dealerId: string; name: string; avgRating: number; feedbackCount: number; isFavorite: boolean };

const medalColor = (rank: number) =>
  rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : rank === 3 ? 'text-amber-700' : 'text-muted-foreground';

export default function CategoryLeaderboardPage() {
  const [categories, setCategories] = useState<Cat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customer/category-leaderboard')
      .then((r) => r.json())
      .then((d) => {
        const cats: Cat[] = Array.isArray(d.categories) ? d.categories : [];
        setCategories(cats);
        if (cats[0]) setSelected(cats[0].category);
      })
      .catch(() => toast.error('Kategoriler yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  const loadBoard = useCallback((cat: string) => {
    setLoading(true);
    fetch(`/api/customer/category-leaderboard?category=${encodeURIComponent(cat)}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.leaderboard) ? d.leaderboard : []))
      .catch(() => toast.error('Liderlik tablosu yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) loadBoard(selected);
  }, [selected, loadBoard]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="En İyi İşletmeler"
        description="Kategorideki en yüksek puanlı işletmeleri keşfet (son 90 gün)"
        icon={<Trophy className="text-white" />}
      />

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setSelected(c.category)}
              className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${
                selected === c.category ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {c.category} <span className="opacity-70">({c.dealerCount})</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Card><CardContent className="p-6"><InlineLoadingStatus /></CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Bu kategoride yeterli yoruma sahip işletme yok (sıralama için en az 3 yorum gerekir).
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.dealerId} className={r.rank <= 3 ? 'border-primary/30' : undefined}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex w-8 shrink-0 items-center justify-center">
                  {r.rank <= 3 ? (
                    <Medal className={`h-6 w-6 ${medalColor(r.rank)}`} />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">{r.rank}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {r.name}
                    {r.isFavorite && <Heart className="h-3.5 w-3.5 shrink-0 fill-red-500 text-red-500" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.feedbackCount} yorum</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {r.avgRating.toFixed(1)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
