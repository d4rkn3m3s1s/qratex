'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Power, Trash2, CalendarDays, Sparkles, Wand2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import {
  SEASONAL_BACKGROUND_OPTIONS,
  SEASONAL_THEME_OPTIONS,
  SEASONAL_TEMPLATES,
} from '@/lib/seasonal-concept-options';

type ConceptRow = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  priority: number;
  backgroundEffect: string | null;
  themePresetId: string | null;
  bannerText: string | null;
  bannerEmoji: string | null;
  bonusMultiplier: number | null;
};

function toLocalInput(d: Date): string {
  // datetime-local için YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function AdminSeasonalConceptsPage() {
  const [list, setList] = useState<ConceptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [bannerEmoji, setBannerEmoji] = useState('');
  const [bannerText, setBannerText] = useState('');
  const [backgroundEffect, setBackgroundEffect] = useState('');
  const [themePresetId, setThemePresetId] = useState('');
  const [priority, setPriority] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/seasonal-concepts')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data.concepts) ? data.concepts : []))
      .catch(() => toast.error('Konseptler yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const applyTemplate = (key: string) => {
    const t = SEASONAL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setName(t.name);
    setBannerEmoji(t.emoji);
    setBannerText(t.bannerText);
    setBackgroundEffect(t.backgroundEffect);
    setThemePresetId(t.themePresetId);
    // Tarihleri bugünden +14 güne varsayılan doldur.
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    setStartDate(toLocalInput(now));
    setEndDate(toLocalInput(end));
    toast.success(`"${t.name}" şablonu dolduruldu — tarihleri kontrol edip kaydedin.`);
  };

  const create = async () => {
    if (!name || !startDate || !endDate) {
      toast.error('Ad, başlangıç ve bitiş tarihi gerekli');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/seasonal-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bannerEmoji: bannerEmoji || null,
          bannerText: bannerText || null,
          backgroundEffect: backgroundEffect || null,
          themePresetId: themePresetId || null,
          priority: Number(priority) || 0,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Oluşturulamadı');
      toast.success('Konsept oluşturuldu');
      setName('');
      setBannerEmoji('');
      setBannerText('');
      setBackgroundEffect('');
      setThemePresetId('');
      setPriority('0');
      setStartDate('');
      setEndDate('');
      fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: ConceptRow) => {
    try {
      const res = await fetch('/api/admin/seasonal-concepts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Güncellenemedi');
      fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/seasonal-concepts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Silinemedi');
      toast.success('Konsept silindi');
      fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    }
  };

  const now = Date.now();
  const active = list.filter(
    (c) => c.isActive && new Date(c.startDate).getTime() <= now && new Date(c.endDate).getTime() >= now
  );
  const upcoming = list.filter((c) => new Date(c.startDate).getTime() > now);
  const past = list.filter((c) => new Date(c.endDate).getTime() < now);

  const renderRow = (c: ConceptRow) => (
    <div
      key={c.id}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3"
    >
      <div className="min-w-0">
        <p className="font-semibold flex items-center gap-2">
          {c.bannerEmoji && <span aria-hidden>{c.bannerEmoji}</span>}
          {c.name}
          {!c.isActive && (
            <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">pasif</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(c.startDate).toLocaleDateString('tr-TR')} →{' '}
          {new Date(c.endDate).toLocaleDateString('tr-TR')}
          {c.backgroundEffect ? ` · efekt: ${c.backgroundEffect}` : ''}
          {c.themePresetId ? ` · tema: ${c.themePresetId}` : ''}
          {c.priority ? ` · öncelik: ${c.priority}` : ''}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={() => toggleActive(c)}>
          <Power className="h-4 w-4 mr-1" /> {c.isActive ? 'Pasifleştir' : 'Aktifleştir'}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(c.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      <AdminPremiumHero
        eyebrow="Görünüm & Kampanya"
        title="Dönemsel Konseptler"
        description="Yaz, kış, Cadılar Bayramı gibi temaları tarih aralığına planla; arka plan, palet ve banner otomatik aktive olur."
        icon={<CalendarDays className="h-7 w-7" aria-hidden />}
      />

      {/* Hızlı şablonlar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Hazır Şablonlar
          </CardTitle>
          <CardDescription>Tek tıkla doldur, tarihleri ayarla, kaydet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SEASONAL_TEMPLATES.map((t) => (
            <Button key={t.key} variant="outline" size="sm" onClick={() => applyTemplate(t.key)}>
              {t.emoji} {t.name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Oluştur */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Yeni Konsept
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Konsept adı</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="örn. Yaz Festivali" />
            </div>
            <div className="space-y-2">
              <Label>Öncelik (çakışmada büyük kazanır)</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} min={0} />
            </div>
            <div className="space-y-2">
              <Label>Başlangıç</Label>
              <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bitiş</Label>
              <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arka plan efekti</Label>
              <Select
                value={backgroundEffect || '__none__'}
                onValueChange={(v) => setBackgroundEffect(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seç" />
                </SelectTrigger>
                <SelectContent>
                  {SEASONAL_BACKGROUND_OPTIONS.map((o) => (
                    <SelectItem key={o.value || 'none'} value={o.value || '__none__'}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Renk paleti</Label>
              <Select
                value={themePresetId || '__none__'}
                onValueChange={(v) => setThemePresetId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seç" />
                </SelectTrigger>
                <SelectContent>
                  {SEASONAL_THEME_OPTIONS.map((o) => (
                    <SelectItem key={o.value || 'none'} value={o.value || '__none__'}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Banner emoji</Label>
              <Input value={bannerEmoji} onChange={(e) => setBannerEmoji(e.target.value)} placeholder="🎄" maxLength={8} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Banner metni</Label>
              <Textarea
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder="Yılbaşı kampanyası başladı! Bol puan seni bekliyor."
                rows={2}
                maxLength={200}
              />
            </div>
          </div>
          <Button onClick={create} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" /> Oluştur</>}
          </Button>
        </CardContent>
      </Card>

      {/* Zaman çizelgesi */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" /> Şu an aktif ({active.length})
            </h3>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aktif konsept yok.</p>
            ) : (
              active.map(renderRow)
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Yaklaşan ({upcoming.length})</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Planlanmış konsept yok.</p>
            ) : (
              upcoming.map(renderRow)
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-muted-foreground">Geçmiş ({past.length})</h3>
              {past.map(renderRow)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
