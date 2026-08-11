'use client';

/**
 * ADMIN karakter rozeti TEST paneli (/admin/character-test).
 *  • Canlı sınıflandırma: serbest yorum yaz → AI hangi KATEGORİ + hangi KARAKTER seçiyor (DB'ye yazmaz).
 *  • Durum: kendi kategorileri + karakter rozetleri.
 *  • Araçlar: reset (rozetleri sil) / fill (barı doldur) / clearCategories — reveal akışını test etmek için.
 */

import { useState, useEffect, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FlaskConical, Sparkles, Loader2, RotateCcw, Wand2, Eraser } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';

interface Status {
  userId: string;
  threshold: number;
  categoryCounts: { category: string; count: number }[];
  characterBadges: { badgeId: string; earnedAt: string }[];
  categories: { key: string; name: string }[];
}
interface ClassifyResult {
  category: { key: string; name: string; emoji: string } | null;
  character: { badgeId: string; name: string; why: string } | null;
}

export default function CharacterTestPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [busy, setBusy] = useState('');
  const [fillCat, setFillCat] = useState('dram-suc');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/character-test?userId=me');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setStatus(data);
      if (data.categories?.[0]) setFillCat((c: string) => c || data.categories[0].key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Durum yüklenemedi');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const classify = async () => {
    if (text.trim().length < 3) { toast.error('Yorum çok kısa'); return; }
    setClassifying(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/character-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'classify', text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || 'Sınıflandırılamadı');
      setResult({ category: data.category, character: data.character });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI sınıflandırma başarısız');
    } finally {
      setClassifying(false);
    }
  };

  const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const res = await fetch('/api/admin/character-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || 'İşlem başarısız');
      toast.success(`${action} tamam`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy('');
    }
  };

  const samples: { label: string; text: string }[] = [
    { label: 'Dram/Suç (sistematik)', text: 'Mekan temiz, çalışanlar güler yüzlü, yemekler başarılı, fiyatlar makul.' },
    { label: 'Komedi (hiperbol)', text: 'Servis o kadar yavaştı ki beklerken sakalım uzadı, kuaför randevusu almam gerekecek.' },
    { label: 'Fantastik (keşif)', text: 'Kapıdan girer girmez başka bir dünyaya adım atıyorsunuz; loş ışık, tarçın kokusu... Mutlaka keşfedin.' },
    { label: 'Gizem/Gerilim (şüphe)', text: 'Garsonun elleri titriyordu, hesabı getirirken gözünü kaçırdı. Bir şeyler ters ama çözemedim.' },
  ];

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<FlaskConical className="h-6 w-6" />}
        title="Karakter Rozeti Test Paneli"
        description="Yorum yaz → AI hangi kategoriye + karaktere atıyor gör (DB'ye yazmaz). Altta reveal akışını test etmek için araçlar."
      />

      {/* CANLI SINIFLANDIRMA */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-amber-500" /> Canlı Sınıflandırma (AI)
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Bir tüketim yorumu yaz…"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setText(s.text)}
                className="text-xs rounded-full border px-3 py-1 hover:bg-muted transition"
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button onClick={classify} disabled={classifying} className={TW_BRAND_CTA_BUTTON}>
            {classifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-2">Sınıflandır</span>
          </Button>

          {result && (
            <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
              <div className="text-lg font-bold">
                {result.category ? `${result.category.emoji} ${result.category.name}` : '—'}
              </div>
              {result.character && (
                <div className="text-sm">
                  <span className="font-semibold">Karakter:</span> {result.character.name}
                  {result.character.why && <p className="mt-1 italic text-muted-foreground">“{result.character.why}”</p>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DURUM */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold">Mevcut Durum (senin hesabın)</div>
          <div className="text-xs text-muted-foreground">Bar eşiği: {status?.threshold ?? '—'} yorum</div>
          <div className="flex flex-wrap gap-2">
            {(status?.categoryCounts ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">Henüz kategoriye atanmış yorum yok.</span>
            )}
            {(status?.categoryCounts ?? []).map((c) => (
              <span key={c.category} className="text-xs rounded-full bg-muted px-3 py-1">
                {c.category}: <b>{c.count}</b>
              </span>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            Kazanılan karakter rozeti: <b>{status?.characterBadges?.length ?? 0}</b>
          </div>
        </CardContent>
      </Card>

      {/* ARAÇLAR */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="text-sm font-semibold">Reveal Akışı Test Araçları</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              <select
                value={fillCat}
                onChange={(e) => setFillCat(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {(status?.categories ?? []).map((c) => (
                  <option key={c.key} value={c.key}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => runAction('fill', { category: fillCat })}
            >
              {busy === 'fill' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span className="ml-2">Barı Doldur (eşiğe kadar)</span>
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => runAction('reset')}>
              {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              <span className="ml-2">Rozetleri Sıfırla</span>
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => runAction('clearCategories')}>
              {busy === 'clearCategories' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
              <span className="ml-2">Kategorileri Temizle</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            “Barı Doldur” senin mevcut tüketim yorumlarını seçili kategoriye atar (bar dolar) — sonra
            <b> /customer/badges</b> sayfasında reveal’i canlı test edebilirsin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
