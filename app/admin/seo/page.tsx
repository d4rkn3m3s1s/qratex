'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';
import { Switch } from '@/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/admin-toast';
import {
  Save,
  Globe,
  FileJson,
  Bot,
  Map,
  FileText,
  Loader2,
  ExternalLink,
  Download,
  Upload,
  History,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SeoGlobalSettings, SeoPageOverride, SeoSettingsPayload, ExtraSitemapEntry } from '@/lib/seo-settings';

type AuditEntry = {
  id: string;
  action: string;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  user?: { email: string | null; name: string | null };
};

type SeoHealthCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
};

export default function AdminSeoPage() {
  const t = useAppT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<SeoSettingsPayload | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthChecks, setHealthChecks] = useState<SeoHealthCheck[]>([]);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);
  const [healthFailedCount, setHealthFailedCount] = useState<number>(0);
  const [showOnlyFailedChecks, setShowOnlyFailedChecks] = useState(false);

  useEffect(() => {
    fetch('/api/admin/seo')
      .then((r) => r.json())
      .then((data) => {
        if (data.global) setPayload({ global: data.global, pageOverrides: data.pageOverrides ?? [] });
        else setPayload(null);
      })
      .catch(() => toast.error('SEO ayarları yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!payload) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kayıt başarısız');
      toast.success('SEO ayarları kaydedildi');
      if (data.settings) setPayload(data.settings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (partial: Partial<SeoGlobalSettings>) => {
    if (!payload) return;
    setPayload({
      ...payload,
      global: { ...payload.global, ...partial },
    });
  };

  const loadAudit = () => {
    setAuditLoading(true);
    fetch('/api/admin/seo/audit')
      .then((r) => r.json())
      .then((data) => setAuditEntries(data.entries ?? []))
      .catch(() => toast.error('Geçmiş yüklenemedi'))
      .finally(() => setAuditLoading(false));
  };

  const runHealthChecks = async () => {
    try {
      setHealthLoading(true);
      const res = await fetch('/api/admin/seo/health', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'SEO health alınamadı');
      setHealthScore(typeof data.score === 'number' ? data.score : null);
      setHealthChecks(Array.isArray(data.checks) ? data.checks : []);
      setHealthCheckedAt(typeof data.checkedAt === 'string' ? data.checkedAt : null);
      setHealthFailedCount(typeof data.failedCount === 'number' ? data.failedCount : 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'SEO health alınamadı');
    } finally {
      setHealthLoading(false);
    }
  };

  const rollback = async (auditLogId: string) => {
    try {
      const res = await fetch('/api/admin/seo/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditLogId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Geri alma başarısız');
      toast.success('Önceki sürüme dönüldü');
      if (data.settings) setPayload(data.settings);
      loadAudit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geri alma başarısız');
    }
  };

  const exportJson = () => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seo-ayarlari-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Dışa aktarıldı');
  };

  const importJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as SeoSettingsPayload;
          if (parsed?.global) {
            setPayload({
              global: { ...payload!.global, ...parsed.global },
              pageOverrides: Array.isArray(parsed.pageOverrides) ? parsed.pageOverrides : payload?.pageOverrides ?? [],
            });
            toast.success('İçe aktarıldı; kaydetmek için Kaydet\'e tıklayın.');
          } else throw new Error('Geçersiz format');
        } catch {
          toast.error('Geçersiz JSON dosyası');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const normalizedPaths = (payload?.pageOverrides ?? []).map((p) => (p.path.replace(/\/$/, '') || '/'));
  const pathCounts = normalizedPaths.reduce<Record<string, number>>((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  const duplicatePaths = Object.entries(pathCounts).filter(([, c]) => c > 1).map(([p]) => p);

  if (loading || !payload) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <PageHeader title="SEO Motoru" description="Arama motorları ve meta ayarları" />
        <InlineLoadingStatus className="py-20" label={t('adminInlineLoading.seoSettings')} />
      </div>
    );
  }

  const g = payload.global;
  const visibleChecks = showOnlyFailedChecks ? healthChecks.filter((check) => !check.passed) : healthChecks;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="SEO Motoru"
        description="Site başlığı, açıklama, Open Graph, JSON-LD, robots ve sitemap ayarları"
      />
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {g.siteUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={g.siteUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Siteyi aç
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportJson} className="gap-2">
          <Download className="h-4 w-4" />
          Dışa aktar
        </Button>
        <Button variant="outline" size="sm" onClick={importJson} className="gap-2">
          <Upload className="h-4 w-4" />
          İçe aktar
        </Button>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
        <Button variant="outline" size="sm" onClick={runHealthChecks} disabled={healthLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
          SEO Health
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {healthScore != null && healthScore >= 80 ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            )}
            Canlı SEO Health Skoru
          </CardTitle>
          <CardDescription>Site URL, meta alanları, robots.txt ve sitemap.xml erişimi canlı kontrol edilir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">
            {healthScore != null ? `${healthScore}/100` : 'Henüz çalıştırılmadı'}
          </div>
          {healthCheckedAt ? (
            <p className="text-xs text-muted-foreground">
              Son kontrol: {new Date(healthCheckedAt).toLocaleString('tr-TR')} • Hata: {healthFailedCount}
            </p>
          ) : null}
          {healthChecks.length > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showOnlyFailedChecks ? 'default' : 'outline'}
                onClick={() => setShowOnlyFailedChecks((v) => !v)}
              >
                {showOnlyFailedChecks ? 'Tüm kontroller' : 'Sadece hatalar'}
              </Button>
            </div>
          ) : null}
          {visibleChecks.length > 0 ? (
            <div className="space-y-2">
              {visibleChecks.map((check) => (
                <div key={check.key} className="rounded-lg border p-2 text-sm flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {check.label}
                      <Badge
                        variant="outline"
                        className={
                          check.severity === 'critical'
                            ? 'border-red-500/50 text-red-600'
                            : check.severity === 'warning'
                              ? 'border-amber-500/50 text-amber-600'
                              : 'border-sky-500/50 text-sky-600'
                        }
                      >
                        {check.severity}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground">{check.detail}</p>
                  </div>
                  <span className={check.passed ? 'text-emerald-600' : 'text-red-600'}>
                    {check.passed ? 'OK' : 'Hata'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">“SEO Health” ile robots/sitemap doğrulamasını başlatın.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google arama önizlemesi</CardTitle>
          <CardDescription>Arama sonuçlarında böyle görünebilir (yaklaşık).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/30 p-4 max-w-2xl">
            <p className="text-blue-600 dark:text-blue-400 text-lg hover:underline cursor-pointer truncate">
              {g.siteUrl?.replace(/^https?:\/\//, '')}
            </p>
            <h3 className="text-xl text-primary font-medium mt-1 truncate">
              {g.defaultTitle || 'Site başlığı'}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {(g.defaultDescription ?? '').slice(0, 160)}
              {(g.defaultDescription?.length ?? 0) > 160 ? '…' : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Önizleme araçları</CardTitle>
          <CardDescription>Kaydettikten sonra paylaşım ve zengin sonuçları test edin.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Google Rich Results Test
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(g.siteUrl)}`} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Facebook Paylaşım Debugger
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="https://cards-dev.twitter.com/validator" target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Twitter Kart Validator
            </a>
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
          <TabsTrigger value="general" className="gap-2">
            <Globe className="h-4 w-4" />
            Genel
          </TabsTrigger>
          <TabsTrigger value="jsonld" className="gap-2">
            <FileJson className="h-4 w-4" />
            JSON-LD
          </TabsTrigger>
          <TabsTrigger value="robots" className="gap-2">
            <Bot className="h-4 w-4" />
            Robots & Sitemap
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-2">
            <FileText className="h-4 w-4" />
            Sayfa Override
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Meta & Open Graph</CardTitle>
              <CardDescription>
                Arama sonuçları ve sosyal paylaşımlarda görünen başlık, açıklama ve görsel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Varsayılan başlık</Label>
                  <Input
                    value={g.defaultTitle}
                    onChange={(e) => updateGlobal({ defaultTitle: e.target.value })}
                    placeholder="Site başlığı"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Site adı</Label>
                  <Input
                    value={g.siteName}
                    onChange={(e) => updateGlobal({ siteName: e.target.value })}
                    placeholder="QRateX"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Varsayılan açıklama (meta description)</Label>
                <Textarea
                  value={g.defaultDescription}
                  onChange={(e) => updateGlobal({ defaultDescription: e.target.value })}
                  rows={3}
                  placeholder="160 karakter civarı önerilir."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Site URL</Label>
                  <Input
                    value={g.siteUrl}
                    onChange={(e) => updateGlobal({ siteUrl: e.target.value })}
                    placeholder="https://qratex.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Canonical base (boş = site URL)</Label>
                  <Input
                    value={g.canonicalBase}
                    onChange={(e) => updateGlobal({ canonicalBase: e.target.value })}
                    placeholder="Opsiyonel"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>OG / Twitter görsel URL (1200x630 önerilir)</Label>
                <Input
                  value={g.ogImageUrl}
                  onChange={(e) => updateGlobal({ ogImageUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>OG genişlik</Label>
                  <Input
                    type="number"
                    value={g.ogImageWidth}
                    onChange={(e) => updateGlobal({ ogImageWidth: Number(e.target.value) || 1200 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>OG yükseklik</Label>
                  <Input
                    type="number"
                    value={g.ogImageHeight}
                    onChange={(e) => updateGlobal({ ogImageHeight: Number(e.target.value) || 630 })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Twitter kullanıcı adı</Label>
                  <Input
                    value={g.twitterHandle}
                    onChange={(e) => updateGlobal({ twitterHandle: e.target.value })}
                    placeholder="@qratex"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Twitter kart tipi</Label>
                  <Select
                    value={g.twitterCard}
                    onValueChange={(v: 'summary' | 'summary_large_image') => updateGlobal({ twitterCard: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="summary">Summary</SelectItem>
                      <SelectItem value="summary_large_image">Summary Large Image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Locale (örn. tr_TR)</Label>
                <Input
                  value={g.locale}
                  onChange={(e) => updateGlobal({ locale: e.target.value })}
                  placeholder="tr_TR"
                />
              </div>
              <div className="space-y-2">
                <Label>Anahtar kelimeler (virgül veya satır ile)</Label>
                <Textarea
                  value={g.keywords.join(', ')}
                  onChange={(e) =>
                    updateGlobal({
                      keywords: e.target.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  rows={2}
                  placeholder="QR kod, geri bildirim, ..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jsonld" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schema.org JSON-LD</CardTitle>
              <CardDescription>
                Organization ve WebSite şemaları; Google zengin sonuçlar için kullanılır.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization adı</Label>
                <Input
                  value={g.organizationName}
                  onChange={(e) => updateGlobal({ organizationName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Organization açıklaması</Label>
                <Textarea
                  value={g.organizationDescription}
                  onChange={(e) => updateGlobal({ organizationDescription: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>WebSite açıklaması</Label>
                <Textarea
                  value={g.websiteDescription}
                  onChange={(e) => updateGlobal({ websiteDescription: e.target.value })}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="robots" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Robots & İndeksleme</CardTitle>
              <CardDescription>
                Arama motorlarının siteyi indekslemesi ve linkleri takip etmesi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>İndekslemeye izin ver (index)</Label>
                  <p className="text-sm text-muted-foreground">false = noindex</p>
                </div>
                <Switch
                  checked={g.robotsIndex}
                  onCheckedChange={(v) => updateGlobal({ robotsIndex: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Link takibine izin ver (follow)</Label>
                </div>
                <Switch
                  checked={g.robotsFollow}
                  onCheckedChange={(v) => updateGlobal({ robotsFollow: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ek disallow yolları (her satırda bir yol)</Label>
                <Textarea
                  value={g.robotsDisallow.join('\n')}
                  onChange={(e) =>
                    updateGlobal({
                      robotsDisallow: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  rows={4}
                  placeholder="/admin/&#10;/api/"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sitemap</CardTitle>
              <CardDescription>Sitemap.xml oluşturulması (app/sitemap.ts ile birlikte çalışır).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Sitemap etkin</Label>
                  <p className="text-sm text-muted-foreground">Robots.txt içinde sitemap URL’si gösterilir.</p>
                </div>
                <Switch
                  checked={g.sitemapEnabled}
                  onCheckedChange={(v) => updateGlobal({ sitemapEnabled: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sitemap ek URL’ler (yol veya tam URL)</Label>
                <p className="text-sm text-muted-foreground">Her satır: URL veya yol (örn. /blog), isteğe bağlı priority (0-1) ve changeFrequency.</p>
                {(g.extraSitemapUrls ?? []).map((e, i) => (
                  <div key={i} className="flex flex-wrap gap-2 items-center">
                    <Input
                      placeholder="/yol veya https://..."
                      value={e.url}
                      onChange={(ev) => {
                        const next = [...(g.extraSitemapUrls ?? [])];
                        next[i] = { ...next[i], url: ev.target.value };
                        updateGlobal({ extraSitemapUrls: next });
                      }}
                      className="flex-1 min-w-[200px]"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      placeholder="Öncelik"
                      value={e.priority ?? ''}
                      onChange={(ev) => {
                        const next = [...(g.extraSitemapUrls ?? [])];
                        const v = ev.target.value ? Number(ev.target.value) : undefined;
                        next[i] = { ...next[i], priority: v };
                        updateGlobal({ extraSitemapUrls: next });
                      }}
                      className="w-24"
                    />
                    <Select
                      value={(e.changeFrequency as string) ?? 'monthly'}
                      onValueChange={(v) => {
                        const next = [...(g.extraSitemapUrls ?? [])];
                        next[i] = { ...next[i], changeFrequency: v as ExtraSitemapEntry['changeFrequency'] };
                        updateGlobal({ extraSitemapUrls: next });
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">always</SelectItem>
                        <SelectItem value="hourly">hourly</SelectItem>
                        <SelectItem value="daily">daily</SelectItem>
                        <SelectItem value="weekly">weekly</SelectItem>
                        <SelectItem value="monthly">monthly</SelectItem>
                        <SelectItem value="yearly">yearly</SelectItem>
                        <SelectItem value="never">never</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      placeholder="lastmod"
                      className="w-36"
                      value={typeof e.lastModified === 'string' ? e.lastModified.slice(0, 10) : ''}
                      onChange={(ev) => {
                        const next = [...(g.extraSitemapUrls ?? [])];
                        const val = ev.target.value ? `${ev.target.value}T00:00:00.000Z` : undefined;
                        next[i] = { ...next[i], lastModified: val };
                        updateGlobal({ extraSitemapUrls: next });
                      }}
                    />
                    <Button variant="ghost" size="icon" onClick={() => updateGlobal({ extraSitemapUrls: (g.extraSitemapUrls ?? []).filter((_, j) => j !== i) })}>Sil</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => updateGlobal({ extraSitemapUrls: [...(g.extraSitemapUrls ?? []), { url: '', changeFrequency: 'monthly' }] })}>URL ekle</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages" className="space-y-6">
          {duplicatePaths.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Aynı sayfa yolu birden fazla kez kullanılıyor: {duplicatePaths.join(', ')}. Tek bir override kalacak şekilde düzenleyin.
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Sayfa bazlı override</CardTitle>
              <CardDescription>
                Belirli sayfa yolları için özel title ve description (ileride layout/pages tarafından kullanılacak).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Public sayfalarda (Güven, Kullanım Şartları, Gizlilik, KVKK, Çerez) generateMetadata bu listeyi kullanır; eşleşen path için title/description/canonical override uygulanır.
              </p>
              <div className="space-y-4">
                {(payload.pageOverrides ?? []).map((p, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                    <Input
                      placeholder="Yol (örn. /guven)"
                      value={p.path}
                      onChange={(e) => {
                        const next = [...(payload.pageOverrides ?? [])];
                        next[i] = { ...next[i], path: e.target.value };
                        setPayload({ ...payload, pageOverrides: next });
                      }}
                      className="w-40"
                    />
                    <Input
                      placeholder="Başlık"
                      value={p.title}
                      onChange={(e) => {
                        const next = [...(payload.pageOverrides ?? [])];
                        next[i] = { ...next[i], title: e.target.value };
                        setPayload({ ...payload, pageOverrides: next });
                      }}
                      className="flex-1 min-w-[160px]"
                    />
                    <Input
                      placeholder="Açıklama"
                      value={p.description}
                      onChange={(e) => {
                        const next = [...(payload.pageOverrides ?? [])];
                        next[i] = { ...next[i], description: e.target.value };
                        setPayload({ ...payload, pageOverrides: next });
                      }}
                      className="flex-1 min-w-[160px]"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = (payload.pageOverrides ?? []).filter((_, j) => j !== i);
                        setPayload({ ...payload, pageOverrides: next });
                      }}
                    >
                      Sil
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setPayload({
                      ...payload,
                      pageOverrides: [...(payload.pageOverrides ?? []), { path: '', title: '', description: '' }],
                    })
                  }
                >
                  Satır ekle
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Geçmiş (Audit)
          </CardTitle>
          <CardDescription>Önceki kayıtlara dönmek için listeyi yükleyin ve &quot;Bu sürüme dön&quot; kullanın.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={loadAudit} disabled={auditLoading} className="mb-4">
            {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            {auditLoading ? ' Yükleniyor…' : ' Geçmişi getir'}
          </Button>
          {auditEntries.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {auditEntries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                  <span>
                    {new Date(entry.createdAt).toLocaleString('tr-TR')} — {entry.action}
                    {entry.user?.email && ` (${entry.user.email})`}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => rollback(entry.id)}>
                    Bu sürüme dön
                  </Button>
                </li>
              ))}
            </ul>
          ) : !auditLoading ? (
            <p className="text-sm text-muted-foreground py-4">Denetim kaydı yok.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
