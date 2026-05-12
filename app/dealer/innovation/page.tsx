'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type ProposalRow = {
  id: string;
  segmentKey: string;
  title: string;
  status: string;
  createdAt: string;
};

export default function DealerInnovationPage() {
  const { data: session } = useSession();
  const [brief, setBrief] = useState<unknown>(null);
  const [pulses, setPulses] = useState<unknown[]>([]);
  const [flashes, setFlashes] = useState<unknown[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [staffInsights, setStaffInsights] = useState(true);
  const [loading, setLoading] = useState(true);

  const [flashTitle, setFlashTitle] = useState('Mutlu saat');
  const [flashBody, setFlashBody] = useState('Şimdi gelen misafirlere özel kısa süreli teklif.');
  const [flashPercent, setFlashPercent] = useState('15');

  const dealerId = session?.user?.id;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p, f, pr, pref] = await Promise.all([
        fetch('/api/dealer/innovation/weekly-brief', { cache: 'no-store' }),
        fetch('/api/dealer/innovation/table-pulses?take=30', { cache: 'no-store' }),
        fetch('/api/dealer/innovation/flash-offers', { cache: 'no-store' }),
        fetch('/api/dealer/innovation/segment-proposals', { cache: 'no-store' }),
        fetch('/api/dealer/innovation/prefs', { cache: 'no-store' }),
      ]);
      setBrief(await b.json());
      const pj = await p.json();
      setPulses(pj.pulses ?? []);
      const fj = await f.json();
      setFlashes(fj.offers ?? []);
      const prj = await pr.json();
      setProposals(prj.proposals ?? []);
      const prefj = await pref.json();
      if (typeof prefj.prefs?.staffTableInsights === 'boolean') {
        setStaffInsights(prefj.prefs.staffTableInsights);
      }
    } catch {
      toast.error('Veri alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshBrief() {
    const res = await fetch('/api/dealer/innovation/weekly-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Özet üretilemedi');
      return;
    }
    toast.success('Haftalık özet güncellendi');
    setBrief(data);
  }

  async function createFlash() {
    const now = new Date();
    const to = new Date(now.getTime() + 30 * 60 * 1000);
    const res = await fetch('/api/dealer/innovation/flash-offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: flashTitle,
        body: flashBody,
        offerType: 'PERCENT',
        value: parseFloat(flashPercent) || 10,
        validFrom: now.toISOString(),
        validTo: to.toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Flash oluşturulamadı');
      return;
    }
    toast.success('Flash teklif oluşturuldu');
    load();
  }

  async function createSegmentProposal(segmentKey: 'sleeping' | 'loyal' | 'first_visit') {
    const res = await fetch('/api/dealer/innovation/segment-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segmentKey, useTemplate: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Taslak oluşturulamadı');
      return;
    }
    toast.success('Taslak oluşturuldu — admin onayı bekleniyor');
    load();
  }

  async function sendApprovedProposal(id: string) {
    const res = await fetch(`/api/dealer/innovation/segment-proposals/${id}/send`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Gönderilemedi');
      return;
    }
    toast.success(`${data.sentCount ?? 0} müşteriye iletildi`);
    load();
  }

  async function updateStaffInsights(next: boolean) {
    setStaffInsights(next);
    const res = await fetch('/api/dealer/innovation/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffTableInsights: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Kaydedilemedi');
      setStaffInsights(!next);
      return;
    }
    toast.success('Tercih kaydedildi');
  }

  function copyTableSignalUrl() {
    if (!dealerId || !origin) return;
    const u = `${origin}/table-signal?dealerId=${encodeURIComponent(dealerId)}`;
    void navigator.clipboard.writeText(u);
    toast.success('Masa sinyali bağlantısı kopyalandı');
  }

  const briefData =
    brief && typeof brief === 'object' && brief !== null && 'brief' in brief
      ? (brief as { brief: { topThemes: unknown; recommendedAction: string } | null }).brief
      : null;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-7 w-7" />
            İnovasyon
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Masa sinyali, flash, haftalık özet ve onaylı segment kampanyaları.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {dealerId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Masa sinyali (QR ile açılır)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">
              Müşteri bu URL&apos;yi açıp tek dokunuşla ekibe haber verir; QR&apos;a şu adresi yazdırın (isteğe bağlı:
              <code className="mx-1">?table=M7</code> veya <code className="mx-1">&qrCodeId=...</code>).
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <code className="text-[11px] bg-muted px-2 py-1 rounded break-all flex-1 min-w-0">
                {origin}/table-signal?dealerId={dealerId}
              </code>
              <Button type="button" variant="secondary" size="sm" className="gap-1 shrink-0" onClick={copyTableSignalUrl}>
                <Copy className="h-4 w-4" />
                Kopyala
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Haftalık yorum özeti</CardTitle>
          <Button size="sm" onClick={refreshBrief}>
            Özeti yeniden üret
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {briefData ? (
            <>
              <p className="font-medium">Önerilen aksiyon</p>
              <p className="text-muted-foreground">{briefData.recommendedAction}</p>
              <p className="font-medium mt-4">En çok geçen temalar</p>
              <ul className="list-disc pl-5">
                {(Array.isArray(briefData.topThemes) ? briefData.topThemes : []).map(
                  (t: unknown, i: number) => (
                    <li key={i}>
                      {typeof t === 'object' && t !== null && 'theme' in t
                        ? `${(t as { theme: string }).theme} (${(t as { count?: number }).count ?? ''})`
                        : JSON.stringify(t)}
                    </li>
                  )
                )}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">
              {loading ? 'Yükleniyor…' : 'Henüz özet yok — yeniden üretin.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>30 dk flash teklif</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Başlık</Label>
            <Input value={flashTitle} onChange={(e) => setFlashTitle(e.target.value)} />
          </div>
          <div>
            <Label>Metin</Label>
            <Textarea value={flashBody} onChange={(e) => setFlashBody(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>İndirim %</Label>
            <Input value={flashPercent} onChange={(e) => setFlashPercent(e.target.value)} />
          </div>
          <Button onClick={createFlash}>Flash oluştur (30 dk)</Button>
          <p className="text-xs text-muted-foreground">
            Müşteri &quot;Yakınımdakiler&quot; sayfasında &quot;Şimdi yakınımda&quot; bölümünde görür.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segment kampanyaları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Taslak oluştur → admin onayı → buradan gönderim (bildirim + push).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => createSegmentProposal('sleeping')}>
              Uykuda şablonu
            </Button>
            <Button size="sm" variant="secondary" onClick={() => createSegmentProposal('loyal')}>
              Sadık şablonu
            </Button>
            <Button size="sm" variant="secondary" onClick={() => createSegmentProposal('first_visit')}>
              İlk ziyaret şablonu
            </Button>
          </div>
          <div className="space-y-2 border-t pt-3">
            {proposals.length === 0 ? (
              <span className="text-muted-foreground">Henüz taslak yok.</span>
            ) : (
              proposals.map((pr) => (
                <div
                  key={pr.id}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium">{pr.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {pr.segmentKey}
                      <Badge variant={pr.status === 'SENT' ? 'default' : 'outline'}>{pr.status}</Badge>
                    </div>
                  </div>
                  {pr.status === 'APPROVED' && (
                    <Button size="sm" onClick={() => sendApprovedProposal(pr.id)}>
                      Müşterilere gönder
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personel / masa içgörüsü (opt-in)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground flex-1">
              Kapalıyken <code className="text-xs">/api/dealer/innovation/table-performance</code> dönmez; isim yerine masa
              kodu kullanılır.
            </p>
            <Switch checked={staffInsights} onCheckedChange={(v) => void updateStaffInsights(v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Son masa sinyalleri</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {pulses.length === 0 ? (
            <span className="text-muted-foreground">Kayıt yok</span>
          ) : (
            (pulses as { id: string; mood: string; tableCode: string | null; createdAt: string }[]).map(
              (x) => (
                <div key={x.id} className="flex justify-between border-b border-border/50 py-1">
                  <span>{x.tableCode ?? '—'}</span>
                  <span className={x.mood === 'CONCERN' ? 'text-amber-600' : 'text-emerald-600'}>
                    {x.mood}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(x.createdAt).toLocaleString()}
                  </span>
                </div>
              )
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktif flash listesi</CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          {flashes.length === 0 ? (
            <span className="text-muted-foreground">Kayıt yok</span>
          ) : (
            (flashes as { id: string; title: string; validTo: string; isActive: boolean }[])
              .slice(0, 10)
              .map((o) => (
                <div key={o.id} className="flex justify-between py-1 border-b border-border/40">
                  <span>{o.title}</span>
                  <span>{new Date(o.validTo).toLocaleString()}</span>
                </div>
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
