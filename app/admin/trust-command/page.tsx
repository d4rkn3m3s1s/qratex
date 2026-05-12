'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  ShieldAlert,
  History,
  FileWarning,
  ClipboardList,
  ExternalLink,
  RefreshCw,
  GitBranch,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

interface TrustSummary {
  auditLogs24h: number;
  suspiciousOpen: number;
  dealersFlagged: number;
  remedyAwaitingApprovalGlobal: number;
  securityAlerts24h: number;
}

type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  severity?: string | null;
  href?: string | null;
  createdAt: string;
};

interface TrustPayload {
  summary: TrustSummary;
  recentSuspicious: Array<{
    id: string;
    type: string;
    severity: string;
    description: string;
    createdAt: string;
    dealerId: string | null;
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    createdAt: string;
    userId: string;
  }>;
}

export default function AdminTrustCommandPage() {
  const [payload, setPayload] = useState<TrustPayload | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const ovRes = await fetch('/api/admin/trust-overview');
      const ov = await ovRes.json();
      if (!ov.success) throw new Error(ov.error || 'Özet yüklenemedi');
      setPayload({
        summary: ov.summary,
        recentSuspicious: ov.recentSuspicious ?? [],
        recentAudit: ov.recentAudit ?? [],
      });
      try {
        const tl = await fetch('/api/admin/trust-timeline').then((r) => r.json());
        setTimeline(tl.success ? (tl.items as TimelineItem[]) ?? [] : []);
      } catch {
        setTimeline([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6 pb-8 w-full">
      <AdminPremiumHero
        eyebrow="Güven"
        title="Trust ve Safety komuta merkezi"
        description="Denetim günlüğü, şüpheli aktivite, bayi fraud durumu ve telafi onay kuyruğu tek bakışta. Detay için ilgili modüllere geçin."
        icon={<Shield className="text-white" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Denetim (24s)
            </CardTitle>
            <CardDescription>AuditLog kayıtları</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{loading ? '—' : payload?.summary.auditLogs24h ?? 0}</p>
            <Button asChild variant="link" className="px-0 h-auto mt-2 text-primary">
              <Link href="/admin/audit">
                Günlüğe git <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Açık şüpheli aktivite
            </CardTitle>
            <CardDescription>Çözülmemiş kayıtlar</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {loading ? '—' : payload?.summary.suspiciousOpen ?? 0}
            </p>
            <Button asChild variant="link" className="px-0 h-auto mt-2 text-primary">
              <Link href="/admin/fraud-prevention">
                Sahtekarlık önleme <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-destructive" />
              İşaretli bayiler
            </CardTitle>
            <CardDescription>flagged / shadow_ban</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-destructive">
              {loading ? '—' : payload?.summary.dealersFlagged ?? 0}
            </p>
            <Button asChild variant="link" className="px-0 h-auto mt-2 text-primary">
              <Link href="/admin/users">Kullanıcılar <ExternalLink className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 sm:col-span-2 lg:col-span-1 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Telafi onay kuyruğu (global)
            </CardTitle>
            <CardDescription>Bayiler henüz yayınlamadı</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{loading ? '—' : payload?.summary.remedyAwaitingApprovalGlobal ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Yayın bayi panelinde &quot;Telafi onayı&quot; sayfasından yapılır.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 sm:col-span-2 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Uyumluluk özeti</CardTitle>
            <CardDescription>KVKK / 5651 envanter ve oranlar</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/compliance">KVKK &amp; 5651 paneline git</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Güvenlik uyarıları (24s, WARNING+): {loading ? '—' : payload?.summary.securityAlerts24h ?? 0}
      </p>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Operasyonel zaman çizelgesi
          </CardTitle>
          <CardDescription>
            Şüpheli aktivite, denetim, telafi onayı, olay, güvenlik, Agent Council ve düşük puanlı geri bildirimler (son
            48 saat, birleşik).
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[420px] overflow-y-auto space-y-2 text-sm">
          {!timeline.length && !loading ? (
            <p className="text-muted-foreground">Kayıt yok</p>
          ) : (
            timeline.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-border/60 p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">{t.kind}</span>
                    {t.severity ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {t.severity}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">{formatRelativeTime(t.createdAt)}</span>
                  </div>
                  <p className="font-medium leading-snug">{t.title}</p>
                  <p className="text-muted-foreground text-xs line-clamp-3">{t.subtitle}</p>
                </div>
                {t.href ? (
                  <Button asChild variant="outline" size="sm" className="shrink-0 h-8 text-xs">
                    <Link href={t.href}>
                      Git <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Son şüpheli kayıtlar</CardTitle>
            <CardDescription>Çözülmemiş, en yeni 8</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[320px] overflow-y-auto text-sm">
            {!payload?.recentSuspicious.length && !loading ? (
              <p className="text-muted-foreground">Kayıt yok</p>
            ) : (
              payload?.recentSuspicious.map((s) => (
                <div key={s.id} className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.type}</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(s.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{s.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Son denetim olayları (24s)</CardTitle>
            <CardDescription>AuditLog, en yeni 8</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[320px] overflow-y-auto text-sm">
            {!payload?.recentAudit.length && !loading ? (
              <p className="text-muted-foreground">Kayıt yok</p>
            ) : (
              payload?.recentAudit.map((a) => (
                <div key={a.id} className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-xs text-muted-foreground">{a.entity}</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</span>
                  </div>
                  {a.entityId && <p className="text-xs text-muted-foreground font-mono break-all">{a.entityId}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
