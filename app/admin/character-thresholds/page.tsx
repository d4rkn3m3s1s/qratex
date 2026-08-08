'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal, Save, RotateCcw, Loader2, Info } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';

interface CategoryRow {
  key: string;
  name: string;
  emoji: string;
  defaultThreshold: number;
  defaultMinReviewLength: number;
}
type Overrides = Record<string, { threshold?: number; minReviewLength?: number }>;

export default function CharacterThresholdsPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [initialSig, setInitialSig] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/character-thresholds');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setCategories(data.categories ?? []);
      setOverrides(data.overrides ?? {});
      setInitialSig(JSON.stringify(data.overrides ?? {}));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(overrides) !== initialSig;

  // Bir kategorinin bir alanını güncelle. Boş → override kaldır (kod-default'a dön).
  const setField = (key: string, field: 'threshold' | 'minReviewLength', raw: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const entry = { ...(next[key] ?? {}) };
      if (raw.trim() === '') {
        delete entry[field];
      } else {
        const n = Math.max(0, Math.floor(Number(raw)));
        if (Number.isFinite(n)) entry[field] = n;
      }
      if (Object.keys(entry).length === 0) delete next[key];
      else next[key] = entry;
      return next;
    });
  };

  const resetCategory = (key: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/character-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Kaydedilemedi');
      setOverrides(data.overrides ?? {});
      setInitialSig(JSON.stringify(data.overrides ?? {}));
      toast.success('Kategori eşikleri kaydedildi ✓');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<SlidersHorizontal className="text-white" />}
        title="Karakter Kategori Eşikleri"
        description="Her karakter kategorisinde bir rozet açmak için gereken yorum sayısını (ve isteğe bağlı min. yorum uzunluğunu) ayarla."
      />

      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Boş bırakılan alan <span className="font-semibold">kod varsayılanını</span> kullanır (placeholder’da gösterilir).
            Eşik = kategoride bir karakter açmak için gereken yorum. Min. uzunluk = 0 ise uzunluk şartı yok (kısa yorum da sayılır).
            Gizemli kategori bilinçli olarak daha zordur (varsayılan 20).
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((cat) => {
            const ov = overrides[cat.key] ?? {};
            const hasOverride = ov.threshold !== undefined || ov.minReviewLength !== undefined;
            return (
              <Card key={cat.key} className={hasOverride ? 'ring-1 ring-primary/40' : ''}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{cat.emoji}</span>
                      <p className="font-bold">{cat.name}</p>
                    </div>
                    {hasOverride && (
                      <button
                        onClick={() => resetCategory(cat.key)}
                        className="flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" /> Varsayılana dön
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Eşik (yorum sayısı)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={ov.threshold ?? ''}
                        placeholder={String(cat.defaultThreshold)}
                        onChange={(e) => setField(cat.key, 'threshold', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Min. uzunluk (karakter)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={ov.minReviewLength ?? ''}
                        placeholder={String(cat.defaultMinReviewLength)}
                        onChange={(e) => setField(cat.key, 'minReviewLength', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty} className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Kaydedilmemiş değişiklikler var</span>}
      </div>
    </div>
  );
}
