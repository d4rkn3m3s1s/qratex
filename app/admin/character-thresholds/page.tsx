'use client';

import { useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal, Save, RotateCcw, Loader2, Info } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';
import { QueryState } from '@/components/states';
import { VersionConflictBanner } from '@/components/settings/version-conflict-banner';
import { fetchResourceJson, requireVersion, saveVersioned } from '@/lib/versioned-resource';
import { useVersionedDraft, useVersionedResource } from '@/hooks/use-versioned-resource';

interface CategoryRow {
  key: string;
  name: string;
  emoji: string;
  defaultThreshold: number;
  defaultMinReviewLength: number;
}
type Overrides = Record<string, { threshold?: number; minReviewLength?: number }>;

type ThresholdsData = { categories: CategoryRow[]; overrides: Overrides };

async function loadThresholds() {
  const body = await fetchResourceJson('/api/admin/settings/character-thresholds', 'Kategori eşikleri yüklenemedi');
  if (!Array.isArray(body.categories) || !body.overrides || typeof body.overrides !== 'object') {
    throw new Error('Kategori eşikleri beklenen biçimde gelmedi');
  }
  return {
    data: { categories: body.categories as CategoryRow[], overrides: body.overrides as Overrides },
    version: requireVersion(body),
  };
}

const HERO_DESCRIPTION =
  'Her karakter kategorisinde bir rozet açmak için gereken yorum sayısını (ve isteğe bağlı min. yorum uzunluğunu) ayarla.';

/**
 * P0-28: override tablosu yalnız sunucudan başarıyla okunduğunda düzenlenebilir. Okuma hatası
 * "override yok" gibi görünmez; kaydetme `baseVersion` taşır (çakışmada 409).
 */
export default function CharacterThresholdsPage() {
  const resource = useVersionedResource(loadThresholds);

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<SlidersHorizontal className="text-white" />}
        title="Karakter Kategori Eşikleri"
        description={HERO_DESCRIPTION}
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

      {resource.status === 'ready' && resource.data && resource.version ? (
        <ThresholdsForm
          key={resource.loadId}
          categories={resource.data.categories}
          initial={resource.data.overrides}
          initialVersion={resource.version}
          onReload={resource.reload}
          onCommitted={(overrides, version) => resource.commit({ categories: resource.data!.categories, overrides }, version)}
        />
      ) : (
        <QueryState
          query={resource.query}
          skeleton="cards"
          isEmpty={() => false}
          loadingLabel="Kategori eşikleri yükleniyor…"
          error={{
            title: 'Kategori eşikleri yüklenemedi',
            description: 'Kayıtlı override’lar okunamadığı için düzenleme kilitlendi. Mevcut ayarlarınız değişmedi; tekrar deneyin.',
          }}
        >
          {null}
        </QueryState>
      )}
    </div>
  );
}

function ThresholdsForm({
  categories,
  initial,
  initialVersion,
  onReload,
  onCommitted,
}: {
  categories: CategoryRow[];
  initial: Overrides;
  initialVersion: string;
  onReload: () => unknown;
  onCommitted: (overrides: Overrides, version: string) => void;
}) {
  const request = useCallback(
    (overrides: Overrides, baseVersion: string) =>
      saveVersioned('/api/admin/settings/character-thresholds', 'PUT', { overrides, baseVersion }, 'Kaydedilemedi'),
    []
  );
  const parse = useCallback(
    (body: Record<string, unknown>) => ({ data: (body.overrides ?? {}) as Overrides, version: requireVersion(body) }),
    []
  );
  const onSaved = useCallback(
    (overrides: Overrides, version: string) => {
      onCommitted(overrides, version);
      toast.success('Kategori eşikleri kaydedildi');
    },
    [onCommitted]
  );
  const onError = useCallback((e: unknown) => {
    toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
  }, []);

  const form = useVersionedDraft<Overrides>({ initial, initialVersion, request, parse, onSaved, onError });
  const overrides = form.draft;
  const setOverrides = form.setDraft;
  const dirty = form.dirty;
  const saving = form.saving;

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

  return (
    <div className="space-y-6">
      {form.conflict && (
        <VersionConflictBanner
          message={form.conflict.message}
          onReload={onReload}
          onOverwrite={form.conflict.currentVersion ? () => form.save({ overwrite: true }) : undefined}
        />
      )}

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
                        type="button"
                        onClick={() => resetCategory(cat.key)}
                        className="flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" /> Varsayılana dön
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`threshold-${cat.key}`} className="text-xs">Eşik (yorum sayısı)</Label>
                      <Input
                        id={`threshold-${cat.key}`}
                        type="number"
                        min={1}
                        value={ov.threshold ?? ''}
                        placeholder={String(cat.defaultThreshold)}
                        onChange={(e) => setField(cat.key, 'threshold', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`minlen-${cat.key}`} className="text-xs">Min. uzunluk (karakter)</Label>
                      <Input
                        id={`minlen-${cat.key}`}
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

      <div className="flex items-center gap-3">
        <Button onClick={() => void form.save()} disabled={saving || !dirty} className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Kaydedilmemiş değişiklikler var</span>}
      </div>
    </div>
  );
}
