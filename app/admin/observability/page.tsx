'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Activity, Server, Clock, AlertTriangle, ExternalLink, BarChart3, List, Zap } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { VercelStatusSummary } from '@/app/api/admin/vercel-status/route';
import type { HealthResponse } from '@/app/api/admin/health/route';

const REFRESH_INTERVAL_MS = 30_000;

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'operational' || s === 'none' || s === 'full') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (s.includes('degraded') || s.includes('performance')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  if (s.includes('partial') || s.includes('major') || s.includes('outage')) return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

export default function AdminObservabilityPage() {
  const [vercelStatus, setVercelStatus] = useState<VercelStatusSummary | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [vercelRes, healthRes] = await Promise.all([
        fetch('/api/admin/vercel-status'),
        fetch('/api/admin/health'),
      ]);
      const vercelOk = vercelRes.ok;
      const healthOk = healthRes.ok;
      const vercelJson = await vercelRes.json();
      const healthJson = await healthRes.json();

      if (!vercelOk) setVercelStatus(null);
      else if (!vercelJson.error) setVercelStatus(vercelJson as VercelStatusSummary);

      if (!healthOk) setHealth(null);
      else setHealth(healthJson as HealthResponse);

      if (!vercelOk && !healthOk) setError('Her iki istek de başarısız.');
      else if (!vercelOk) setError('Vercel durumu alınamadı.');
      else if (!healthOk) setError('Sağlık kontrolü alınamadı.');

      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Veri yüklenemedi');
      setVercelStatus(null);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastFetched) return '—';
    const sec = Math.floor((Date.now() - lastFetched.getTime()) / 1000);
    if (sec < 10) return 'az önce';
    if (sec < 60) return `${sec} sn önce`;
    return `${Math.floor(sec / 60)} dk önce`;
  }, [lastFetched, tick]);

  const incidentCount = vercelStatus?.incidents?.length ?? 0;

  return (
    <div className="min-h-screen bg-background relative">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.08),transparent)]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/[0.05] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 h-[350px] w-[350px] rounded-full bg-primary/[0.05] blur-3xl" />
      </div>

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">
        <AdminPremiumHero
          eyebrow="Operasyon"
          title="Sistem Sagligi"
          description="Vercel platform durumu, uygulama sağlığı ve son 60 saniye metrikleri. Veriler 30 saniyede bir yenilenir."
          icon={<Activity className="text-white" />}
          chips={
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm bg-background/85 text-foreground border-border/70 dark:bg-white/20 dark:text-white dark:border-white/35">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-200" />
                </span>
                Canlı
              </span>
              {incidentCount > 0 && (
                <Badge className="bg-amber-400/90 text-amber-950 border-amber-200 hover:bg-amber-400">
                  {incidentCount} olay
                </Badge>
              )}
            </div>
          }
          aside={
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-end w-full">
              {vercelStatus && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-white">
                  <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-100" />
                  <Badge className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                    {vercelStatus.indicator.status}
                  </Badge>
                </div>
              )}
              {health && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-white">
                    <Server className={`h-5 w-5 ${health.ok ? 'text-emerald-200' : 'text-red-200'}`} />
                    <span className="text-sm font-semibold">{health.ok ? 'App OK' : 'App Hata'}</span>
                    <span className="text-xs text-muted-foreground tabular-nums dark:text-white/80">{health.latencyMs} ms</span>
                  </div>
                  {health.metrics && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-white">
                      <Zap className="h-5 w-5 text-amber-200" />
                      <span className="text-sm font-bold tabular-nums">{health.metrics.last60s.requests}</span>
                      <span className="text-xs text-muted-foreground dark:text-white/80">istek / 60 sn</span>
                    </div>
                  )}
                </>
              )}
            </div>
          }
        />

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 shadow-lg"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </span>
            <Button variant="outline" size="sm" onClick={fetchData} className="border-red-500/30">
              Yenile
            </Button>
          </motion.div>
        )}

        {/* Son güncelleme + Yenile */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Son güncelleme: <span className="font-semibold text-foreground">{lastUpdatedLabel}</span>
          </p>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="shadow-sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {/* 3 ana kart */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-primary/20">
              <BarChart3 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Özet kartlar</h2>
              <p className="text-xs text-muted-foreground">Platform, sağlık ve trafik</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Vercel Status */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="h-full relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-cyan-600 opacity-90" />
                <CardHeader className="pb-2 pl-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    Vercel Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-6">
                  {loading && !vercelStatus ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : vercelStatus ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground leading-relaxed">{vercelStatus.indicator.description}</p>
                      <Badge className={statusBadgeClass(vercelStatus.indicator.status)} variant="outline">
                        {vercelStatus.indicator.status}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* App Health */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="h-full relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-emerald-600 opacity-90" />
                <CardHeader className="pb-2 pl-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Server className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    App Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-6">
                  {loading && !health ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : health ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={health.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'} variant="outline">
                          {health.ok ? 'OK' : 'Hata'}
                        </Badge>
                        <span className="text-lg font-bold tabular-nums text-foreground">{health.latencyMs}</span>
                        <span className="text-sm text-muted-foreground">ms</span>
                      </div>
                      {health.region && <p className="text-xs text-muted-foreground font-mono">{health.region}</p>}
                      {health.database != null && (
                        <p className="text-xs text-muted-foreground">DB: {health.database === 'ok' ? 'Bağlı' : 'Hata'}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Last 60s */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="h-full relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-500 to-amber-600 opacity-90" />
                <CardHeader className="pb-2 pl-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    Son 60 sn
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-6">
                  {loading && !health ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : health?.metrics ? (
                    <div className="space-y-1">
                      <p className="text-sm"><span className="font-bold tabular-nums text-foreground text-lg">{health.metrics.last60s.requests}</span> istek</p>
                      <p className="text-sm"><span className="font-bold tabular-nums text-foreground">{health.metrics.last60s.errors}</span> hata</p>
                      <p className="text-sm"><span className="font-bold tabular-nums text-foreground">{health.metrics.last60s.avgMs.toFixed(1)}</span> ms ort.</p>
                      <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">In-memory, örnek bazlı</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Vercel Components */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/30">
              <List className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Vercel bileşenleri</h2>
              <p className="text-xs text-muted-foreground">Servis durumları ve son güncelleme</p>
            </div>
          </div>
          <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <CardContent className="p-0">
              {loading && !vercelStatus ? (
                <Skeleton className="h-48 w-full rounded-b-lg" />
              ) : vercelStatus?.components?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-4 py-3 font-semibold">Bileşen</th>
                        <th className="px-4 py-3 font-semibold">Durum</th>
                        <th className="px-4 py-3 font-semibold">Güncellenme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vercelStatus.components.map((c) => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3">
                            <Badge className={statusBadgeClass(c.status)} variant="outline">{c.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {c.updated_at ? new Date(c.updated_at).toLocaleString('tr-TR') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">Bileşen listesi yok.</div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Incidents */}
        {vercelStatus?.incidents?.length ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Açık olaylar</h2>
                <p className="text-xs text-muted-foreground">{vercelStatus.incidents.length} kayıt</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {vercelStatus.incidents.map((i) => (
                <Card key={i.id} className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{i.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {i.created_at ? new Date(i.created_at).toLocaleString('tr-TR') : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusBadgeClass(i.status)} variant="outline">{i.status}</Badge>
                      {i.shortlink && (
                        <a href={i.shortlink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Detay <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* Top Paths */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">En çok istek alan path’ler</h2>
              <p className="text-xs text-muted-foreground">Son 60 saniye, istek sayısına göre</p>
            </div>
          </div>
          <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <CardContent className="p-0">
              {loading && !health ? (
                <Skeleton className="h-32 w-full rounded-b-lg" />
              ) : health?.metrics?.topPaths?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-4 py-3 font-semibold">Path</th>
                        <th className="px-4 py-3 font-semibold">İstek</th>
                        <th className="px-4 py-3 font-semibold">Hata</th>
                        <th className="px-4 py-3 font-semibold">Ort. ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.metrics.topPaths.map((row) => (
                        <tr key={row.path} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{row.path}</td>
                          <td className="px-4 py-3 font-semibold tabular-nums">{row.requests}</td>
                          <td className="px-4 py-3 tabular-nums">{row.errors}</td>
                          <td className="px-4 py-3 tabular-nums">{row.avgMs.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">Henüz veri yok.</div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
