'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BookOpen,
  FlaskConical,
  Layers,
  Link2,
  Radar,
  RefreshCw,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/admin-toast';
import type { InnovationPlatformConfig } from '@/lib/innovation-config';
import { useAppT } from '@/lib/app-locale';

export default function AdminInnovationPage() {
  const t = useAppT();
  const [risk, setRisk] = useState<unknown>(null);
  const [config, setConfig] = useState<InnovationPlatformConfig | null>(null);
  const [segments, setSegments] = useState<unknown[]>([]);
  const [flash, setFlash] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoDealerId, setDemoDealerId] = useState('');
  const [scenarioDealerId, setScenarioDealerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [abReport, setAbReport] = useState<{ experiments?: unknown[] } | null>(null);
  const [healthV2, setHealthV2] = useState<{
    dealers?: Array<{
      dealerId: string;
      label: string;
      score: number;
      remedyQueue: number;
      remedyStale: number;
      tableConcernRatio: number;
      repeatVisitorRatio: number | null;
    }>;
    earlyWarnings?: unknown[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, s, f, ab, h] = await Promise.all([
        fetch('/api/admin/innovation/risk-dashboard', { cache: 'no-store' }),
        fetch('/api/admin/innovation/config', { cache: 'no-store' }),
        fetch('/api/admin/innovation/segment-proposals', { cache: 'no-store' }),
        fetch('/api/admin/innovation/flash-offers', { cache: 'no-store' }),
        fetch('/api/admin/innovation/ab-report', { cache: 'no-store' }),
        fetch('/api/admin/innovation/health-score-v2', { cache: 'no-store' }),
      ]);
      setRisk(await r.json());
      const cj = await c.json();
      setConfig(cj.config ?? null);
      const sj = await s.json();
      setSegments(sj.proposals ?? []);
      const fj = await f.json();
      setFlash(fj.offers ?? []);
      setAbReport(await ab.json());
      setHealthV2(await h.json());
    } catch {
      toast.error('Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveConfig(patch: Partial<InnovationPlatformConfig>) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/innovation/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      toast.success('Kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  }

  async function approveSegment(id: string, status: 'APPROVED' | 'REJECTED') {
    const res = await fetch(`/api/admin/innovation/segment-proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('İşlem başarısız');
      return;
    }
    toast.success(t('common.updated'));
    load();
  }

  async function runDemo() {
    if (!demoDealerId.trim()) {
      toast.error('Bayi ID girin');
      return;
    }
    const res = await fetch('/api/admin/innovation/demo-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealerId: demoDealerId.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Demo oluşturulamadı');
      return;
    }
    toast.success('Demo paketi oluşturuldu');
    load();
  }

  async function runDemoScenario(runSeed: boolean) {
    const id = scenarioDealerId.trim() || demoDealerId.trim();
    if (!id) {
      toast.error('Bayi ID girin (senaryo veya demo alanı)');
      return;
    }
    const res = await fetch('/api/admin/innovation/demo-scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealerId: id, runSeed }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Senaryo başlatılamadı');
      return;
    }
    toast.success(runSeed ? '120 sn senaryo + veri yazıldı' : 'Senaryo adımları hazır (sadece plan)');
    load();
  }

  const summary = risk && typeof risk === 'object' && risk !== null && 'summary' in risk
    ? (risk as { summary: Record<string, unknown> }).summary
    : null;

  return (
    <div className="space-y-8 pb-10">
      <AdminPremiumHero
        icon={<Radar className="text-white" />}
        eyebrow="Platform"
        title="İnovasyon Platformu"
        description="Sessiz masa sinyali, flash teklifler, haftalık özet, segment onayı, risk panosu, uyumluluk ve partner özet API — tek yerden."
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Activity className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base">Orphan / risk özeti</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {summary ? (
              <>
                <p>Telafi onay kuyruğu: <strong>{String(summary.remedyAwaitingApproval ?? '—')}</strong></p>
                <p>Eski açık telafi (&gt;48s): <strong>{String(summary.remedyStaleOpenCount ?? '—')}</strong></p>
                <p>24s içinde bitecek flash: <strong>{String(summary.flashOffersEndingSoon24h ?? '—')}</strong></p>
                <p>Düşük puan kümesi: <strong>{String(summary.lowRatedClusters ?? '—')}</strong></p>
              </>
            ) : (
              <p className="text-muted-foreground">{loading ? 'Yükleniyor…' : 'Veri yok'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Shield className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Uyumluluk merkezi (özet)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-muted-foreground">
              Saklama süresi ve silme iletişimi innovation config içinde; denetim günlüğü{' '}
              <code className="text-xs bg-muted px-1 rounded">/admin/audit</code>
            </p>
            {config?.compliance && (
              <>
                <p>Saklama (gün): <strong>{config.compliance.retentionDaysPersonalData}</strong></p>
                <p>KVKK iletişim: <strong>{config.compliance.deletionRequestContactEmail}</strong></p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/compliance#kvkk-queue">KVKK talep kuyruğu</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/compliance">Uyumluluk merkezi</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={config.compliance.auditLogUrl || '/admin/audit'}>Denetim günlüğü</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Zap className="h-5 w-5 text-yellow-600" />
            <CardTitle className="text-base">Özellik anahtarları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config?.features && (
              <>
                {(
                  Object.entries(config.features) as [string, boolean][]
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-normal capitalize">{k}</Label>
                    <Switch
                      checked={v}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        saveConfig({ features: { ...config.features, [k]: checked } })
                      }
                    />
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Activity className="h-5 w-5 text-rose-600" />
          <CardTitle className="text-base">Sağlık skoru 2.0 (telafi SLA + masa kapanışı + tekrar)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs overflow-x-auto space-y-2">
          <p className="text-muted-foreground text-sm">
            Bayiler tek skorda sıralanır; düşük skorlar erken uyarı listesinde özetlenir.
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left bg-muted/40">
                <th className="p-2">Bayi</th>
                <th className="p-2">Skor</th>
                <th className="p-2">Telafi kuyruk</th>
                <th className="p-2">SLA aşımı</th>
                <th className="p-2">CONCERN oranı</th>
                <th className="p-2">Tekrar oranı</th>
              </tr>
            </thead>
            <tbody>
              {(healthV2?.dealers ?? []).slice(0, 25).map((d) => (
                <tr key={d.dealerId} className="border-b border-border/50">
                  <td className="p-2 max-w-[10rem] truncate">{d.label}</td>
                  <td className="p-2 font-mono">{d.score}</td>
                  <td className="p-2">{d.remedyQueue}</td>
                  <td className="p-2">{d.remedyStale}</td>
                  <td className="p-2">{d.tableConcernRatio}</td>
                  <td className="p-2">{d.repeatVisitorRatio ?? '—'}</td>
                </tr>
              ))}
              {(!healthV2?.dealers || healthV2.dealers.length === 0) && (
                <tr>
                  <td colSpan={6} className="p-3 text-muted-foreground">
                    {loading ? 'Yükleniyor…' : 'Bayi verisi yok'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Layers className="h-5 w-5" />
          <CardTitle>Segment kampanya onay kuyruğu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bekleyen taslak yok.</p>
          ) : (
            segments.map((p: unknown) => {
              const row = p as {
                id: string;
                segmentKey: string;
                title: string;
                dealer?: { businessName?: string };
              };
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{row.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.segmentKey} · {row.dealer?.businessName ?? 'Bayi'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={() => approveSegment(row.id, 'APPROVED')}>
                      Onayla
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => approveSegment(row.id, 'REJECTED')}>
                      Reddet
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Sparkles className="h-5 w-5" />
          <CardTitle>Tenant demo paketi</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Bayi kullanıcı ID</Label>
            <Input value={demoDealerId} onChange={(e) => setDemoDealerId(e.target.value)} placeholder="dealer user id" />
          </div>
          <Button onClick={runDemo}>Paket aç</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <FlaskConical className="h-5 w-5 text-violet-600" />
          <CardTitle>120 sn canlı senaryo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Adım adım simülasyon planı; isteğe bağlı olarak demo paketiyle aynı veriyi DB&apos;ye yazar. Video yerine canlı
            tur için kullanın.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Bayi ID (boşsa demo paketindeki ID kullanılır)</Label>
              <Input
                value={scenarioDealerId}
                onChange={(e) => setScenarioDealerId(e.target.value)}
                placeholder="isteğe bağlı"
              />
            </div>
            <Button variant="outline" onClick={() => void runDemoScenario(false)}>
              Sadece plan
            </Button>
            <Button onClick={() => void runDemoScenario(true)}>Plan + veri yaz</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <FlaskConical className="h-5 w-5" />
          <CardTitle>A/B kampanya deneyleri</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          <p className="text-muted-foreground">
            Deney tanımları `campaignAb.experiments` (PUT /api/admin/innovation/config). Gösterim/kayıt müşteri{' '}
            <code className="text-xs bg-muted px-1 rounded">GET /api/customer/innovation/ab/variant</code> ile yapılır.
            Varyantlar metin, bildirim başlığı, push saati ve kampanya görseli boyutunda kırılır (
            <code className="text-xs bg-muted px-1 rounded">dimension</code> alanı).
          </p>
          <p>Aktif deney: <strong>{config?.campaignAb?.experiments?.filter((e) => e.active).length ?? 0}</strong></p>
          <div className="rounded-md border overflow-x-auto text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2">Deney</th>
                  <th className="p-2">Varyant</th>
                  <th className="p-2">Boyut</th>
                  <th className="p-2">Gösterim</th>
                  <th className="p-2">Dönüşüm</th>
                  <th className="p-2">Oran %</th>
                </tr>
              </thead>
              <tbody>
                {((abReport?.experiments as unknown[]) || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-muted-foreground">
                      Son 30 günde kayıt yok.
                    </td>
                  </tr>
                ) : (
                  (
                    (abReport?.experiments || []) as {
                      experimentId: string;
                      variant: string;
                      dimension?: string | null;
                      impressions: number;
                      conversions: number;
                      conversionRatePercent: number | null;
                    }[]
                  ).map((row, i) => (
                    <tr key={`${row.experimentId}-${row.variant}-${row.dimension ?? 'x'}-${i}`} className="border-b border-border/50">
                      <td className="p-2 font-mono">{row.experimentId}</td>
                      <td className="p-2">{row.variant}</td>
                      <td className="p-2">{row.dimension ?? '—'}</td>
                      <td className="p-2">{row.impressions}</td>
                      <td className="p-2">{row.conversions}</td>
                      <td className="p-2">{row.conversionRatePercent ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Link2 className="h-5 w-5" />
          <CardTitle>Partner webhook (24 saatlik özet)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Inngest saatlik cron (<code className="text-xs">15 * * * *</code>) ile POST gönderir. Gövde{' '}
            <code className="text-xs">buildPartnerDigestPayload</code> ile GET digest ile aynıdır. İmza başlığı:{' '}
            <code className="text-xs">X-Qratex-Signature: sha256=...</code>
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Webhook aktif</Label>
            <Switch
              checked={!!config?.partnerDigest?.webhookEnabled}
              disabled={saving}
              onCheckedChange={(checked) =>
                saveConfig({
                  partnerDigest: {
                    ...config?.partnerDigest,
                    webhookEnabled: checked,
                  },
                })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Webhook URL</Label>
            <Input
              className="mt-1 font-mono text-xs"
              placeholder="https://pos.sirket.com/hooks/qratex-digest"
              value={config?.partnerDigest?.webhookUrl ?? ''}
              onChange={(e) =>
                setConfig((c) =>
                  c
                    ? {
                        ...c,
                        partnerDigest: { ...c.partnerDigest, webhookUrl: e.target.value },
                      }
                    : c
                )
              }
              onBlur={() => {
                if (config?.partnerDigest?.webhookUrl != null) {
                  void saveConfig({ partnerDigest: config.partnerDigest });
                }
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Webhook secret (HMAC)</Label>
            <Input
              className="mt-1 font-mono text-xs"
              type="password"
              autoComplete="off"
              placeholder="••••"
              value={config?.partnerDigest?.webhookSecret ?? ''}
              onChange={(e) =>
                setConfig((c) =>
                  c
                    ? {
                        ...c,
                        partnerDigest: { ...c.partnerDigest, webhookSecret: e.target.value },
                      }
                    : c
                )
              }
              onBlur={() => {
                if (config?.partnerDigest) {
                  void saveConfig({ partnerDigest: config.partnerDigest });
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <BookOpen className="h-5 w-5 text-sky-600" />
          <CardTitle className="text-base">Partner entegrasyon paketi</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="text-muted-foreground">
            Olay kataloğu, imza başlıkları ve örnek POS onayı —{' '}
            <code className="text-xs bg-muted px-1 rounded">GET /api/partner/v1/catalog</code> (Bearer{' '}
            <code className="text-xs bg-muted px-1 rounded">qrx_...</code>
            API anahtarı).
          </p>
          <p className="text-xs text-muted-foreground">
            Webhook gövdesi ve REST digest ile aynı şema; imza doğrulama için{' '}
            <code className="bg-muted px-1 rounded">X-Qratex-Signature</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Son flash teklifleri (tüm bayiler)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs overflow-x-auto">
          {flash.length === 0 ? (
            <span className="text-muted-foreground">Kayıt yok</span>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Başlık</th>
                  <th className="p-2">Bayi</th>
                  <th className="p-2">Bitiş</th>
                </tr>
              </thead>
              <tbody>
                {(flash as { id: string; title: string; validTo: string; dealer?: { businessName?: string } }[])
                  .slice(0, 15)
                  .map((o) => (
                    <tr key={o.id} className="border-b border-border/60">
                      <td className="p-2">{o.title}</td>
                      <td className="p-2">{o.dealer?.businessName ?? '—'}</td>
                      <td className="p-2">{new Date(o.validTo).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
