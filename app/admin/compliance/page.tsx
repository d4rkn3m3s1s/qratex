'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, FileText, AlertTriangle, RefreshCw, Database, Search } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';

interface OverviewPayload {
  summary: {
    totalUsers: number;
    totalFeedbacks: number;
    totalConsumptions: number;
    unresolvedSuspicious: number;
    activeSuspiciousLast30d: number;
  };
  logging: {
    auditCoverage: {
      withIpPercent: number;
      withUserAgentPercent: number;
      totalAuditLogs: number;
    };
    cardAuditCoverage: {
      withIpPercent: number;
      totalCardAuditLogs: number;
    };
    note: string;
  };
  kvkkInventory: Array<{
    category: string;
    models: string[];
    fields: string[];
    purpose: string;
    legalBasis: string;
    retention: string;
  }>;
  legalChecklist: string[];
}

interface UnifiedLog {
  id: string;
  source: 'AUDIT' | 'CARD_AUDIT' | 'SUSPICIOUS';
  action: string;
  entity: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  severity?: string;
}

type PrivacyRequestRow = {
  id: string;
  email: string;
  type: string;
  status: string;
  message: string | null;
  receiptSentAt: string | null;
  createdAt: string;
  processedAt: string | null;
  userId: string | null;
};

export default function AdminCompliancePage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'all' | 'audit' | 'card' | 'suspicious'>('all');
  const [search, setSearch] = useState('');
  const [privacyRows, setPrivacyRows] = useState<PrivacyRequestRow[]>([]);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  async function fetchPrivacy() {
    setPrivacyLoading(true);
    try {
      const res = await fetch('/api/admin/privacy-requests', { cache: 'no-store' });
      const j = await res.json();
      if (res.ok && Array.isArray(j.requests)) setPrivacyRows(j.requests);
      else setPrivacyRows([]);
    } catch {
      setPrivacyRows([]);
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, logsRes] = await Promise.all([
        fetch('/api/admin/compliance/overview', { cache: 'no-store' }),
        fetch(`/api/admin/compliance/logs?source=${source}&page=1&pageSize=25`, { cache: 'no-store' }),
      ]);
      const overviewJson = await overviewRes.json();
      const logsJson = await logsRes.json();
      if (overviewJson.success) setOverview(overviewJson.data);
      else setError(overviewJson.error ?? 'Özet yüklenemedi');
      if (logsJson.success) setLogs(logsJson.data ?? []);
      else {
        setLogs([]);
        if (overviewJson.success) setError(logsJson.error ?? 'Loglar yüklenemedi');
      }
      void fetchPrivacy();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Veriler yüklenemedi';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function setPrivacyStatus(id: string, status: PrivacyRequestRow['status']) {
    const res = await fetch(`/api/admin/privacy-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('Güncellenemedi');
      return;
    }
    toast.success('Durum güncellendi');
    void fetchPrivacy();
  }

  useEffect(() => {
    fetchData();
  }, [source]);

  const sourceLabelMap: Record<UnifiedLog['source'], string> = {
    AUDIT: 'Denetim',
    CARD_AUDIT: 'Kart Denetimi',
    SUSPICIOUS: 'Şüpheli Olay',
  };

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return logs;
    return logs.filter((log) =>
      `${sourceLabelMap[log.source]} ${log.action} ${log.entity} ${log.userName || ''} ${log.userEmail || ''} ${log.userId || ''} ${log.ipAddress || ''} ${log.userAgent || ''}`
        .toLocaleLowerCase('tr-TR')
        .includes(q)
    );
  }, [logs, search]);

  const coverageTone = useMemo(() => {
    const auditIp = overview?.logging.auditCoverage.withIpPercent || 0;
    if (auditIp >= 90) return 'success';
    if (auditIp >= 70) return 'warning';
    return 'destructive';
  }, [overview]);

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="KVKK & 5651 Uyum Merkezi"
        description="Veri envanteri, log kapsamı, saklama disiplini ve denetim izlerini tek panelden yönetin."
        icon={<ShieldCheck className="text-white" />}
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Loglarda ara: aksiyon, varlık, IP, kullanıcı..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {(['all', 'audit', 'card', 'suspicious'] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={source === key ? 'default' : 'outline'}
            onClick={() => setSource(key)}
          >
            {key === 'all'
              ? 'Tüm Loglar'
              : key === 'audit'
              ? 'Denetim'
              : key === 'card'
              ? 'Kart Denetimi'
              : 'Şüpheli Olaylar'}
          </Button>
        ))}
      </div>

      {overview && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4 text-cyan-500" />
                  Kayıtlı Kullanıcılar
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{overview.summary.totalUsers.toLocaleString()}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Denetim Logları
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{overview.logging.auditCoverage.totalAuditLogs.toLocaleString()}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Denetim IP Kapsamı
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold flex items-center gap-2">
                %{overview.logging.auditCoverage.withIpPercent}
                <Badge
                  className={
                    coverageTone === 'success'
                      ? 'bg-emerald-600'
                      : coverageTone === 'warning'
                      ? 'bg-amber-600'
                      : 'bg-destructive'
                  }
                >
                  {coverageTone === 'success' ? 'iyi' : coverageTone === 'warning' ? 'orta' : 'düşük'}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Çözülmemiş Şüpheli Olay
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{overview.summary.unresolvedSuspicious}</CardContent>
            </Card>
          </div>

          <Card id="kvkk-queue">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                <span>Veri sahibi talepleri (KVKK)</span>
                <Button variant="outline" size="sm" onClick={() => void fetchPrivacy()} disabled={privacyLoading}>
                  {privacyLoading ? 'Yükleniyor…' : 'Yenile'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <p className="text-muted-foreground mb-3">
                Başvurular <code className="text-xs bg-muted px-1 rounded">POST /api/customer/privacy-request</code> ile
                alınır; müşteriye otomatik makbuz e-postası (yapılandırıldıysa) gider.
              </p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b text-left bg-muted/40">
                    <th className="p-2">Tür</th>
                    <th className="p-2">E-posta</th>
                    <th className="p-2">Durum</th>
                    <th className="p-2">Makbuz</th>
                    <th className="p-2">Tarih</th>
                    <th className="p-2">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {privacyRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-muted-foreground">
                        {privacyLoading ? 'Yükleniyor…' : 'Kayıt yok'}
                      </td>
                    </tr>
                  ) : (
                    privacyRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50">
                        <td className="p-2">{row.type}</td>
                        <td className="p-2 font-mono text-xs">{row.email}</td>
                        <td className="p-2">
                          <Badge variant="outline">{row.status}</Badge>
                        </td>
                        <td className="p-2 text-xs">
                          {row.receiptSentAt ? new Date(row.receiptSentAt).toLocaleString() : '—'}
                        </td>
                        <td className="p-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                        <td className="p-2 flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => void setPrivacyStatus(row.id, 'in_review')}>
                            İncelemede
                          </Button>
                          <Button size="sm" onClick={() => void setPrivacyStatus(row.id, 'completed')}>
                            Tamamlandı
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>KVKK Veri Envanteri</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.kvkkInventory.map((item) => (
                <div key={item.category} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{item.category}</Badge>
                    <span className="text-xs text-muted-foreground">Modeller: {item.models.join(', ')}</span>
                  </div>
                  <p className="text-sm"><strong>Alanlar:</strong> {item.fields.join(', ')}</p>
                  <p className="text-sm"><strong>Amaç:</strong> {item.purpose}</p>
                  <p className="text-sm"><strong>Hukuki Dayanak:</strong> {item.legalBasis}</p>
                  <p className="text-sm"><strong>Saklama:</strong> {item.retention}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5651 / Güvenlik Log Akışı (IP Maskeleme Açık)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 text-sm text-muted-foreground">
                Toplam gösterilen kayıt: <strong>{filteredLogs.length}</strong> - IP adresleri KVKK gereği maskeleme ile sunulur.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4">Kaynak</th>
                      <th className="py-2 pr-4">Aksiyon</th>
                      <th className="py-2 pr-4">Varlık</th>
                      <th className="py-2 pr-4">Kullanıcı</th>
                      <th className="py-2 pr-4">IP</th>
                      <th className="py-2 pr-4">Tarayıcı</th>
                      <th className="py-2 pr-4">Önem</th>
                      <th className="py-2 pr-4">Zaman</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-muted-foreground">
                          Henüz log yok.
                        </td>
                      </tr>
                    ) : (
                    filteredLogs.map((log) => (
                      <tr key={`${log.source}-${log.id}`} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Badge variant="secondary">{sourceLabelMap[log.source]}</Badge>
                        </td>
                        <td className="py-2 pr-4">{log.action}</td>
                        <td className="py-2 pr-4">{log.entity}</td>
                        <td className="py-2 pr-4">
                          <div className="text-sm font-medium">{log.userName || 'Bilinmeyen kullanıcı'}</div>
                          <div className="text-xs text-muted-foreground">{log.userEmail || log.userId || '-'}</div>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">{log.ipAddress || '-'}</td>
                        <td className="py-2 pr-4 max-w-[220px] truncate" title={log.userAgent || ''}>
                          {log.userAgent || '-'}
                        </td>
                        <td className="py-2 pr-4">
                          {log.severity ? <Badge variant="outline">{log.severity}</Badge> : '-'}
                        </td>
                        <td className="py-2 pr-4">{new Date(log.createdAt).toLocaleString('tr-TR')}</td>
                      </tr>
                    ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hukuki Kontrol Listesi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overview.legalChecklist.map((item) => (
                <div key={item} className="text-sm">
                  - {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detaylı Uyum Notları</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>- Bu panel operasyonel görünürlük sağlar; nihai hukuki yorum için hukuk birimi onayı gerekir.</p>
              <p>- 5651 açısından kritik olaylarda aksiyon, zaman damgası, kullanıcı/oturum ve IP eşleşmesi tutulmalıdır.</p>
              <p>- KVKK için kişisel veri minimizasyonu, saklama süresi ve silme/anonimleştirme süreçleri yazılı olmalıdır.</p>
              <p>- İdari erişimlerde rol bazlı yetki ve erişim kayıtları düzenli denetlenmelidir.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

