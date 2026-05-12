'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/admin-toast';
import { Clock, Copy, Share2, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AtDealerPayload = {
  dealerId: string;
  dealerLabel: string;
  visitCount: number;
  loyalty: { level: string; nextAt: number | null };
  experiences: Array<{
    id: string;
    kind: string;
    rating: number;
    label: string;
    createdAt: string;
  }>;
};

export default function CustomerExperiencesPage() {
  const searchParams = useSearchParams();
  const initialDealer = searchParams.get('dealerId') || '';

  const [dealerId, setDealerId] = useState(initialDealer);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<AtDealerPayload | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const [improveTemplate, setImproveTemplate] = useState('tone');
  const [improveMessage, setImproveMessage] = useState('');
  const [improveHours, setImproveHours] = useState('48');
  const [improveBusy, setImproveBusy] = useState(false);

  const load = useCallback(async () => {
    if (!dealerId.trim()) {
      setPayload(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/customer/experiences/at-dealer?dealerId=${encodeURIComponent(dealerId.trim())}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Yüklenemedi');
      setPayload(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [dealerId]);

  useEffect(() => {
    if (initialDealer) void load();
  }, [initialDealer, load]);

  async function createShare() {
    if (!dealerId.trim()) {
      toast.error('Önce işletme ID girin');
      return;
    }
    setShareBusy(true);
    try {
      const res = await fetch('/api/customer/experience-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealerId: dealerId.trim(),
          caption: 'Bu hafta buradaydık — gelirsen şunu dene.',
          mood: 'good',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Oluşturulamadı');
      setShareUrl(data.shareUrl);
      toast.success('Paylaşım linki hazır');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setShareBusy(false);
    }
  }

  async function sendImprovement() {
    if (!dealerId.trim() || improveMessage.trim().length < 5) {
      toast.error('Kısa bir mesaj yazın (en az 5 karakter)');
      return;
    }
    setImproveBusy(true);
    try {
      const res = await fetch('/api/customer/improvement-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealerId: dealerId.trim(),
          templateKey: improveTemplate,
          message: improveMessage.trim(),
          expectedHours: Number(improveHours) || 48,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gönderilemedi');
      toast.success(
        `İyileştirme isteği kaydedildi. Tahmini dönüş: ${new Date(data.expectedResponseBy).toLocaleString()}`
      );
      setImproveMessage('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setImproveBusy(false);
    }
  }

  function copyShare() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl);
    toast.success('Link kopyalandı');
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title="İşletmede deneyim"
        description="Son deneyimleriniz, yerel sadakat rozeti ve arkadaşınıza güvenli paylaşım — kişisel veriyi abartmadan."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">İşletme</CardTitle>
          <CardDescription>
            Tüketim veya geri bildirim verdiğiniz işletmenin kullanıcı (bayi) ID’sini girin; yakın sayfasından veya fişten
            edinebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label className="text-xs">Bayi / işletme kullanıcı ID</Label>
            <Input value={dealerId} onChange={(e) => setDealerId(e.target.value)} placeholder="dealer id" />
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? 'Yükleniyor…' : 'Yükle'}
          </Button>
        </CardContent>
      </Card>

      {payload && (
        <>
          <Card className="border-primary/15 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {payload.dealerLabel}
              </CardTitle>
              <CardDescription>
                Ziyaret sayısı (geri bildirim + tüketim kayıtları):{' '}
                <strong>{payload.visitCount}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="default" className="text-sm">
                  {payload.loyalty.level}
                </Badge>
                {payload.loyalty.nextAt != null && (
                  <span className="text-xs text-muted-foreground">
                    Sonraki rozet eşiği: {payload.loyalty.nextAt}. ziyaret
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Bu işletmedeki son 3 deneyimim
                </p>
                <ul className="space-y-2">
                  {payload.experiences.length === 0 ? (
                    <li className="text-sm text-muted-foreground">Henüz kayıt yok.</li>
                  ) : (
                    payload.experiences.map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card/60 px-3 py-2 text-sm"
                      >
                        <span className="font-medium tabular-nums">{ex.rating.toFixed(1)} ★</span>
                        <Badge variant="outline" className="truncate max-w-[12rem]">
                          {ex.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(ex.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Arkadaşla paylaş
              </CardTitle>
              <CardDescription>
                Tek link — işletme adı ve kısa not; kimlik veya hesap bilgisi verilmez.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => void createShare()} disabled={shareBusy} className="gap-2">
                Deneyim kartı oluştur (7 gün)
              </Button>
              {shareUrl && (
                <div className="flex flex-wrap gap-2 items-center">
                  <code className="text-xs bg-muted px-2 py-1 rounded max-w-full truncate flex-1">{shareUrl}</code>
                  <Button type="button" variant="outline" size="sm" onClick={copyShare} className="gap-1">
                    <Copy className="h-4 w-4" />
                    Kopyala
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Şikâyet değil — iyileştirme isteği
              </CardTitle>
              <CardDescription>
                Yapıcı geri bildirim şablonu. İşletmeye tipik dönüş süresi mesajı gider (varsayılan 48 saat).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Şablon</Label>
                <Select value={improveTemplate} onValueChange={setImproveTemplate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tone">Üslup / iletişim</SelectItem>
                    <SelectItem value="speed">Hız / bekleme</SelectItem>
                    <SelectItem value="quality">Kalite / lezzet</SelectItem>
                    <SelectItem value="value">Fiyat-değer</SelectItem>
                    <SelectItem value="other">Diğer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Mesajınız</Label>
                <Textarea
                  value={improveMessage}
                  onChange={(e) => setImproveMessage(e.target.value)}
                  placeholder="Kısa ve net: neyin daha iyi olmasını istersiniz?"
                  rows={4}
                />
              </div>
              <div className="space-y-2 max-w-xs">
                <Label className="text-xs">Tahmini dönüş (saat)</Label>
                <Input type="number" min={12} max={168} value={improveHours} onChange={(e) => setImproveHours(e.target.value)} />
              </div>
              <Button onClick={() => void sendImprovement()} disabled={improveBusy}>
                {improveBusy ? 'Gönderiliyor…' : 'İyileştirme isteği gönder'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
