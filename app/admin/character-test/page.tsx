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
import { FlaskConical, Sparkles, Loader2, RotateCcw, Wand2, Eraser, PlayCircle } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';
import { CharacterReveal, type RevealCharacter } from '@/components/customer/character-reveal';

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
  const [targetEmail, setTargetEmail] = useState(''); // boş=me(admin); email=demo customer hedefle
  // Reveal önizleme (DB-free): admin rozetin nasıl açıldığını canlı görür.
  const [revealCat, setRevealCat] = useState('dram-suc');
  const [revealVariant, setRevealVariant] = useState<'orb' | 'mascot'>('orb');
  const [revealChar, setRevealChar] = useState<RevealCharacter>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

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

  // Reveal önizleme: seçili kategoriden karakter çek (DB-free) → CharacterReveal aç.
  const previewReveal = async () => {
    setRevealLoading(true);
    try {
      const res = await fetch('/api/admin/character-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revealPreview', category: revealCat }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || 'Önizleme alınamadı');
      setRevealChar(data.character);
      setRevealOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reveal önizleme başarısız');
    } finally {
      setRevealLoading(false);
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

      {/* ROZET AÇILIŞI (REVEAL) ÖNİZLEME — DB'ye dokunmaz */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PlayCircle className="h-4 w-4 text-fuchsia-500" /> Rozet Açılışı (Reveal) Önizleme
          </div>
          <p className="text-xs text-muted-foreground">
            Kategori seç → “Açılışı Oynat” → kullanıcının rozeti açarken gördüğü animasyonun aynısı burada oynar
            (DB’ye hiçbir şey yazılmaz, gerçek reveal akışının önizlemesidir).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              <select
                value={revealCat}
                onChange={(e) => setRevealCat(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {(status?.categories ?? []).map((c) => (
                  <option key={c.key} value={c.key}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Görsel varyant</Label>
              <select
                value={revealVariant}
                onChange={(e) => setRevealVariant(e.target.value as 'orb' | 'mascot')}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="orb">Küre (orb)</option>
                <option value="mascot">Maskot</option>
              </select>
            </div>
            <Button onClick={previewReveal} disabled={revealLoading} className={TW_BRAND_CTA_BUTTON}>
              {revealLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              <span className="ml-2">Açılışı Oynat</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gerçek reveal bileşeni — fetchOnOpen=false → önizleme karakteriyle oynar, API/DB çağırmaz */}
      <CharacterReveal
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        character={revealChar}
        fetchOnOpen={false}
        variant={revealVariant}
      />

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
              <Label className="text-xs">Hedef kullanıcı (email)</Label>
              <Input
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="boş = kendim (admin)"
                className="h-9 w-56"
              />
            </div>
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
              onClick={() => runAction('fill', { category: fillCat, userId: targetEmail || 'me', synthetic: true })}
            >
              {busy === 'fill' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span className="ml-2">Barı Doldur (sentetik)</span>
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => runAction('reset', { userId: targetEmail || 'me' })}>
              {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              <span className="ml-2">Rozetleri Sıfırla</span>
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => runAction('clearCategories', { userId: targetEmail || 'me' })}>
              {busy === 'clearCategories' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
              <span className="ml-2">Kategorileri Temizle</span>
            </Button>
            <Button variant="destructive" disabled={!!busy} onClick={() => runAction('cleanupTest', { userId: targetEmail || 'me' })}>
              {busy === 'cleanupTest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
              <span className="ml-2">Test Verisini Sil</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <b>Barı Doldur (sentetik):</b> hedef kullanıcının barı eşiğe ulaşana kadar
            <b> işaretli test yorumları</b> üretir (gerçek yorum yoksa da bar dolar) — sonra
            <b> /customer/badges</b> sayfasında reveal’i uçtan uca test edebilirsin.
            <br /><b>Test Verisini Sil:</b> üretilen sentetik tüketim/yorumları temizler (gerçek veriye dokunmaz).
            Email boşsa işlemler <b>kendi (admin)</b> hesabına uygulanır.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
