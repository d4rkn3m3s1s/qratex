'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users, MessageSquare, QrCode, TrendingUp, Trophy, Activity, RefreshCw,
  Zap, Shield, CreditCard, BarChart3, PieChart, Star, AlertCircle,
  SlidersHorizontal, Server, Radio, ToggleLeft, Link2, Key, Plus,
  UserCheck, AlertTriangle, ClipboardList, Circle, type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCompactNumber, formatRelativeTime } from '@/lib/utils';
import { toast } from '@/lib/admin-toast';

import type {
  DashboardData, AnalyticsData, AiStats, CardStats, TechSummary,
  SystemStatus, SettingsSummary, ComplianceOverview, AuditEntry,
  SegmentSummary, TimelineItem, RecentUser, RecentFeedback,
} from './types';
import {
  iconMap, REFRESH_INTERVAL_MS, ANA_OZELLIKLER, HIZLI_ERISIM,
} from './admin-utils';
import {
  HeroSection, MainFeaturesGrid, QuickAccessGrid,
  AnalyticsSection, AiSection, SentimentSection, TimelineSection,
} from './components';

const dashboardToasts = {
  warn: (message: string) => toast.error(message),
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [installToValue, setInstallToValue] = useState<{
    averageMinutes: number | null;
    medianMinutes: number | null;
    p95Minutes: number | null;
    sampleSize: number;
    cappedOutliers: number;
  } | null>(null);
  const [adminActionCompletion, setAdminActionCompletion] = useState<number | null>(null);
  const [tenantHealth, setTenantHealth] = useState<{ atRiskCount: number; avgScore: number } | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [cardStats, setCardStats] = useState<CardStats | null>(null);
  const [complianceOverview, setComplianceOverview] = useState<ComplianceOverview | null>(null);
  const [auditRecent, setAuditRecent] = useState<AuditEntry[]>([]);
  const [segmentSummary, setSegmentSummary] = useState<SegmentSummary | null>(null);
  const [techSummary, setTechSummary] = useState<TechSummary | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [settingsSummary, setSettingsSummary] = useState<SettingsSummary | null>(null);

  const fetchJsonSafe = async (url: string, retries = 1) => {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        return await res.json();
      } catch (error) {
        const isLastAttempt = attempt >= retries;
        if (isLastAttempt) return null;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return null;
  };

  const fetchAux = async () => {
    try {
      const [itv, kpi, th, analyticsRes, aiRes, cardsRes, complianceRes, auditRes, segmentsRes, techRes, systemRes, settingsRes] = await Promise.all([
        fetchJsonSafe('/api/admin/onboarding/install-to-value'),
        fetchJsonSafe('/api/admin/kpis/action-completion?period=30d'),
        fetchJsonSafe('/api/admin/tenant-health'),
        fetchJsonSafe('/api/admin/analytics?period=30d'),
        fetchJsonSafe('/api/admin/dealers-ai-stats'),
        fetchJsonSafe('/api/admin/cards?page=1&pageSize=1'),
        fetchJsonSafe('/api/admin/compliance/overview'),
        fetchJsonSafe('/api/admin/audit?pageSize=8'),
        fetchJsonSafe('/api/admin/segments'),
        fetchJsonSafe('/api/admin/tech-summary'),
        fetchJsonSafe('/api/admin/system-status'),
        fetchJsonSafe('/api/admin/settings'),
      ]);
      if (itv && (itv.averageMinutes != null || itv.installToValue)) {
        setInstallToValue({
          averageMinutes: itv.averageMinutes ?? null,
          medianMinutes: itv.medianMinutes ?? null,
          p95Minutes: itv.p95Minutes ?? null,
          sampleSize: Number(itv.sampleSize) || 0,
          cappedOutliers: Number(itv.cappedOutliers) || 0,
        });
      }
      if (kpi && typeof kpi.averageRate === 'number') setAdminActionCompletion(kpi.averageRate);
      if (th && th.tenantHealth && Array.isArray(th.tenantHealth)) {
        const atRisk = th.tenantHealth.filter((t: { healthScore: number }) => t.healthScore < 70).length;
        const avg = th.tenantHealth.length > 0 ? th.tenantHealth.reduce((s: number, t: { healthScore: number }) => s + t.healthScore, 0) / th.tenantHealth.length : 0;
        setTenantHealth({ atRiskCount: atRisk, avgScore: Math.round(avg) });
      }
      if (analyticsRes?.success && analyticsRes?.data) {
        const d = analyticsRes.data;
        setAnalyticsData({
          totalUsers: d.totalUsers, totalFeedbacks: d.totalFeedbacks, userGrowth: d.userGrowth, feedbackGrowth: d.feedbackGrowth, avgRating: d.avgRating,
          comparison: d.comparison, ratingDistribution: d.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          dailyData: d.dailyData || [], roleDistribution: d.roleDistribution || {},
          sentimentBreakdown: d.sentimentBreakdown || { positive: 0, neutral: 0, negative: 0 },
        });
      }
      if (aiRes?.analyzedCount !== undefined) {
        setAiStats({ analyzedCount: aiRes.analyzedCount ?? 0, urgentCount: aiRes.urgentCount ?? 0, toxicCount: aiRes.toxicCount ?? 0, churnCount: aiRes.churnCount ?? 0, intentDist: aiRes.intentDist || {}, recentAnalyses: aiRes.recentAnalyses || [] });
      }
      if (cardsRes?.success && cardsRes?.stats) {
        setCardStats({ UNUSED: cardsRes.stats.UNUSED ?? 0, ACTIVATED: cardsRes.stats.ACTIVATED ?? 0, BLOCKED: cardsRes.stats.BLOCKED ?? 0, total: cardsRes.stats.total ?? 0 });
      }
      if (complianceRes?.success && complianceRes?.data) {
        const d = complianceRes.data;
        setComplianceOverview({
          summary: d.summary || { totalUsers: 0, totalFeedbacks: 0, totalConsumptions: 0, unresolvedSuspicious: 0, activeSuspiciousLast30d: 0 },
          logging: d.logging || { auditCoverage: { totalAuditLogs: 0, withIpPercent: 0, withUserAgentPercent: 0 }, cardAuditCoverage: { totalCardAuditLogs: 0, withIpPercent: 0 } },
        });
      }
      if (auditRes?.entries && Array.isArray(auditRes.entries)) {
        setAuditRecent(auditRes.entries.slice(0, 8).map((e: AuditEntry) => ({ id: e.id, entity: e.entity, action: e.action, createdAt: e.createdAt, user: e.user })));
      }
      if (segmentsRes?.success && segmentsRes?.segments) {
        setSegmentSummary(segmentsRes.segments.map((s: { id: string; name: string; color: string; icon: string; count: number }) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, count: s.count })));
      }
      if (techRes?.success && techRes?.features != null) { setTechSummary({ features: techRes.features, webhooks: techRes.webhooks, apiKeys: techRes.apiKeys }); }
      if (systemRes?.success && systemRes?.status) {
        setSystemStatus({ status: systemRes.status, timestamp: systemRes.timestamp, checks: systemRes.checks || {}, environment: systemRes.environment || { label: '—', nodeEnv: '', isVercel: false, vercelEnv: null, region: null }, dbLatencyMs: systemRes.dbLatencyMs ?? null });
      }
      if (settingsRes?.settings && typeof settingsRes.settings === 'object') {
        const cats = Object.keys(settingsRes.settings).length;
        const raw = settingsRes.raw;
        setSettingsSummary({ categoriesCount: cats, keysCount: Array.isArray(raw) ? raw.length : 0 });
      }
    } catch { /* ignore */ }
  };

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const result = await fetchJsonSafe('/api/admin/dashboard', 1);
      if (!result) {
        if (!data) dashboardToasts.warn('Baglanti hatasi olustu.');
        return;
      }
      if (result.success) { setData(result); setLastUpdated(new Date()); }
      else { dashboardToasts.warn('Dashboard verileri yuklenemedi.'); }
    } catch (error) { console.error('Dashboard fetch error:', error); if (!data) dashboardToasts.warn('Baglanti hatasi olustu.'); }
    finally { setLoading(false); }
  };

  const refreshAll = async () => { await Promise.all([fetchDashboard(), fetchAux()]); };

  useEffect(() => { refreshAll(); const t = setInterval(refreshAll, REFRESH_INTERVAL_MS); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 5000); return () => clearInterval(t); }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return '—';
    const sec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (sec < 10) return 'az önce';
    if (sec < 60) return `${sec} sn önce`;
    return `${Math.floor(sec / 60)} dk önce`;
  }, [lastUpdated, loading, tick]);

  const sonYapilanlar: TimelineItem[] = useMemo(() => {
    if (!data) return [];
    const items: TimelineItem[] = [];
    data.recentUsers.forEach((u) => items.push({ id: `u-${u.id}`, type: 'user', time: u.createdAt, user: u }));
    data.recentFeedbacks.forEach((f) => items.push({ id: `f-${f.id}`, type: 'feedback', time: f.createdAt, feedback: f }));
    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return items.slice(0, 30);
  }, [data]);

  /* ── Loading state ── */
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-52 animate-pulse rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background sm:rounded-3xl" />
        <div className="p-2 sm:p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
        <Activity className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Veriler yüklenemedi</h3>
        <p className="text-muted-foreground mb-4">Lütfen tekrar deneyin</p>
        <Button onClick={refreshAll}><RefreshCw className="h-4 w-4 mr-2" />Yenile</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.04),transparent)]" />
        <div className="absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-primary/[0.025] blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-[320px] h-[320px] bg-primary/[0.03] rounded-full blur-3xl" />
      </div>

      {/* Hero */}
      <HeroSection data={data} analyticsData={analyticsData} />

      <main className="w-full px-1 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-4 md:py-6 space-y-4 sm:space-y-6 md:space-y-8 lg:space-y-12 relative">
        {/* Live stats */}
        <section className="space-y-3 sm:space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Son güncelleme: <span className="font-semibold text-foreground">{lastUpdatedLabel}</span></p>
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading} className="shadow-sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Yenile
            </Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {data.stats.map((stat, index) => {
              const IconComponent: LucideIcon = iconMap[stat.icon] || Activity;
              return <StatsCard key={stat.title} title={stat.title} value={stat.value} change={stat.change} icon={IconComponent} iconColor={stat.iconColor} iconBgColor={stat.iconBgColor} delay={index * 0.05} />;
            })}
          </div>
          {/* KPI mini cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
            {installToValue != null && (
              <Card className="relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-500 to-amber-600 opacity-90" />
                <CardContent className="p-3 flex items-center gap-3 pl-4 sm:p-4 sm:pl-5 md:p-5 md:gap-4 md:pl-6">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Zap className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Install-to-value</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Install-to-value açıklaması"
                          >
                            <Circle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Medyan değer gösterilir. P95 ise işletmelerin %95'inin bu sürenin altında ilk değeri gördüğünü ifade eder.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-2xl font-bold mt-0.5 text-foreground">
                      {installToValue.medianMinutes != null ? `${installToValue.medianMinutes} dk` : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      P95: {installToValue.p95Minutes != null ? `${installToValue.p95Minutes} dk` : '—'}
                      {installToValue.sampleSize > 0 ? ` · n=${installToValue.sampleSize}` : ''}
                      {installToValue.cappedOutliers > 0 ? ` · ${installToValue.cappedOutliers} outlier sınırlandı` : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {adminActionCompletion != null && (
              <Card className="relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-teal-500/5 transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-teal-500 to-teal-600 opacity-90" />
                <CardContent className="p-3 flex items-center gap-3 pl-4 sm:p-4 sm:pl-5 md:p-5 md:gap-4 md:pl-6">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Activity className="h-6 w-6 sm:h-7 sm:w-7 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksiyon tamamlama (30 gün)</p>
                    <p className="text-2xl font-bold mt-0.5 text-foreground">%{adminActionCompletion}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {tenantHealth != null && (
              <Card className="relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-500 to-orange-500 opacity-90" />
                <CardContent className="p-3 flex items-center gap-3 pl-4 sm:p-4 sm:pl-5 md:p-5 md:gap-4 md:pl-6">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Shield className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tenant health</p>
                    <p className="text-2xl font-bold mt-0.5 text-foreground">{tenantHealth.avgScore}/100</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tenantHealth.atRiskCount} risk altında</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* System status + Settings summary */}
          <div className="grid gap-2 sm:gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-3 mt-3 sm:mt-4">
            {systemStatus && (
              <Card className="relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 md:col-span-2">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 via-transparent to-cyan-500/5" />
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <CardContent className="relative p-3 sm:p-4 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${systemStatus.status === 'healthy' ? 'bg-emerald-500/20 shadow-lg shadow-emerald-500/20' : systemStatus.status === 'degraded' ? 'bg-amber-500/20 shadow-lg shadow-amber-500/20' : 'bg-red-500/20 shadow-lg shadow-red-500/20'}`}>
                        <Server className={`h-6 w-6 sm:h-8 sm:w-8 ${systemStatus.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : systemStatus.status === 'degraded' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground">Sunucu durumu</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">Veritabanı ve ortam (Vercel)</p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${systemStatus.status === 'healthy' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : systemStatus.status === 'degraded' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30'}`}>
                            <span className={`relative flex h-1.5 w-1.5 ${systemStatus.status === 'healthy' ? '' : 'animate-ping'}`}>
                              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus.status === 'healthy' ? 'bg-emerald-400' : systemStatus.status === 'degraded' ? 'bg-amber-400' : 'bg-red-400'}`} />
                              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${systemStatus.status === 'healthy' ? 'bg-emerald-500' : systemStatus.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            </span>
                            {systemStatus.status === 'healthy' ? 'Sağlıklı' : systemStatus.status === 'degraded' ? 'Uyarı' : 'Hata'}
                          </span>
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">{systemStatus.environment?.label ?? '—'}</span>
                          {systemStatus.dbLatencyMs != null && <span className="text-xs text-muted-foreground tabular-nums">DB <strong className="text-foreground">{systemStatus.dbLatencyMs}</strong> ms</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">Son kontrol: {systemStatus.timestamp ? new Date(systemStatus.timestamp).toLocaleString('tr-TR') : '—'}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {settingsSummary != null && (
              <Link href="/admin/settings">
                <Card className="h-full relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 group">
                  <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-primary/70 opacity-90" />
                  <CardContent className="p-3 sm:p-4 md:p-6 flex flex-col gap-2 sm:gap-3 pl-4 sm:pl-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/30 transition-transform group-hover:scale-105 sm:h-12 sm:w-12 sm:rounded-2xl">
                      <SlidersHorizontal className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">Ayar özeti</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Yapılandırma ve genel ayarlar</p>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-auto">
                      <span className="text-xs text-muted-foreground"><strong className="text-foreground tabular-nums">{settingsSummary.categoriesCount}</strong> kategori</span>
                      <span className="text-xs text-muted-foreground"><strong className="text-foreground tabular-nums">{settingsSummary.keysCount}</strong> ayar</span>
                    </div>
                    <span className="text-xs font-medium text-primary flex items-center gap-1">Ayarlar →</span>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </section>

        {/* Advanced summary */}
        <section className="space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center shadow-inner"><Star className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" /></div>
            <div><h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Gelişmiş özet</h2><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">CSAT, acil işler ve haftalık trend</p></div>
          </div>
          <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {analyticsData != null && (() => {
              const dist = analyticsData.ratingDistribution || {};
              const totalRatings = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
              const csatPct = Math.round(((dist[4] ?? 0) + (dist[5] ?? 0)) / totalRatings * 100);
              return (
                <Link href="/admin/analytics">
                  <Card className="h-full relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-500 to-orange-500 opacity-90" />
                    <CardContent className="p-3 sm:p-4 md:p-5 pl-4 sm:pl-5 md:pl-6">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:scale-105 transition-transform"><Star className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" /></div>
                        <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CSAT (4-5 yıldız)</p><p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">%{csatPct}</p><p className="text-[10px] text-muted-foreground">Ort. {analyticsData.avgRating?.toFixed(1) ?? '—'}/5 · 30 gün</p></div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })()}
            {aiStats != null && (
              <Link href="/admin/ai-dashboard">
                <Card className="h-full relative overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300 group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-500 to-red-700 opacity-90" />
                  <CardContent className="p-3 sm:p-4 md:p-5 pl-4 sm:pl-5 md:pl-6">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-red-500/20 flex items-center justify-center group-hover:scale-105 transition-transform"><AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" /></div>
                      <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Acil aksiyonlar (AI)</p><p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{(aiStats.urgentCount || 0) + (aiStats.toxicCount || 0) + (aiStats.churnCount || 0)}</p><p className="text-[10px] text-muted-foreground">Acil · Toksik · Churn</p></div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            {analyticsData != null && (
              <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg sm:col-span-2">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-sm sm:text-base font-semibold">Son 7 gün geri bildirim</p>
                  <p className="text-[10px] text-muted-foreground">Analitik · günlük toplam</p>
                  {analyticsData.dailyData && analyticsData.dailyData.length > 0 ? (
                    <div className="flex items-end gap-1 sm:gap-2 h-24 sm:h-28 mt-2">
                      {(analyticsData.dailyData || []).slice(-7).map((day) => {
                        const maxF = Math.max(1, ...(analyticsData.dailyData || []).slice(-7).map((d) => d.feedbacks));
                        const h = (day.feedbacks / maxF) * 100;
                        return (
                          <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={`${day.label}: ${day.feedbacks}`}>
                            <div className="w-full rounded-t-sm bg-gradient-to-t from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300 min-h-[4px] transition-all" style={{ height: `${Math.max(8, h)}%` }} />
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate max-w-full text-center">{day.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-24 sm:h-28 text-sm text-muted-foreground rounded-lg bg-muted/30 border border-dashed border-border mt-2">Günlük veri henüz yok</div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Main features */}
        <section className="space-y-3 sm:space-y-5">
          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 flex items-center justify-center shadow-inner"><BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /></div>
            <div><h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Ana özellikler</h2><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">En çok kullandığınız modüllere hızlı erişim</p></div>
          </div>
          <MainFeaturesGrid items={ANA_OZELLIKLER} />
        </section>

        {/* Analytics */}
        {analyticsData && <AnalyticsSection analyticsData={analyticsData} />}

        {/* AI */}
        {aiStats && <AiSection aiStats={aiStats} />}

        {/* Sentiment */}
        <SentimentSection data={data} />

        {/* Top Dealers */}
        <section className="space-y-3 sm:space-y-5">
          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center shadow-inner"><Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" /></div>
            <div><h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">En iyi işletmeler</h2><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">En çok geri bildirim alan ve en yüksek puanlı işletmeler</p></div>
          </div>
          <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <CardContent className="pt-6 pb-6">
              {data.topDealers.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Henüz işletme yok</p> : (
                <ul className="space-y-3">
                  {data.topDealers.map((dealer, index) => {
                    const maxFeedbacks = Math.max(1, ...data.topDealers.map((d) => d.feedbacks));
                    const barPct = (dealer.feedbacks / maxFeedbacks) * 100;
                    const isPodium = index < 3;
                    const rankStyle = index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/50' : index === 1 ? 'bg-gradient-to-br from-zinc-300 to-zinc-500 dark:from-zinc-500 dark:to-zinc-600 text-white shadow-md ring-2 ring-zinc-300/50 dark:ring-zinc-500/50' : index === 2 ? 'bg-gradient-to-br from-amber-700 to-amber-800 text-amber-100 shadow-md ring-2 ring-amber-600/50' : 'bg-muted text-muted-foreground';
                    return (
                      <li key={dealer.id} className={`flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors ${isPodium ? 'bg-gradient-to-r from-amber-500/5 to-transparent dark:from-amber-500/10' : ''}`}>
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold shrink-0 ${rankStyle}`}>{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate text-foreground">{dealer.name}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-32"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500" style={{ width: `${barPct}%` }} /></div>
                            <span className="text-xs text-muted-foreground tabular-nums font-medium">{dealer.feedbacks} geri bildirim</span>
                          </div>
                        </div>
                        <Badge className="shrink-0 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/30">⭐ {dealer.rating.toFixed(1)}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Timeline */}
        <TimelineSection items={sonYapilanlar} />

        {/* Platform summary */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-500/20 to-slate-600/20 flex items-center justify-center shadow-inner"><PieChart className="h-6 w-6 text-slate-600 dark:text-slate-400" /></div>
            <div><h2 className="text-2xl font-bold text-foreground tracking-tight">Platform özeti</h2><p className="text-sm text-muted-foreground mt-0.5">Toplam sayılar ve genel metrikler</p></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Kullanıcı', value: data.totals.users, icon: Users, gradient: 'from-blue-500/20 to-blue-600/10', iconColor: 'text-blue-600 dark:text-blue-400' },
              { label: 'Geri bildirim', value: data.totals.feedbacks, icon: MessageSquare, gradient: 'from-green-500/20 to-green-600/10', iconColor: 'text-green-600 dark:text-green-400' },
              { label: 'QR kod', value: data.totals.qrCodes, icon: QrCode, gradient: 'from-primary/20 to-primary/10', iconColor: 'text-primary' },
              { label: 'Aktif QR', value: data.totals.activeQRCodes, icon: QrCode, gradient: 'from-amber-500/20 to-amber-600/10', iconColor: 'text-amber-600 dark:text-amber-400' },
              { label: 'Tarama', value: data.totals.scans, icon: TrendingUp, gradient: 'from-teal-500/20 to-teal-600/10', iconColor: 'text-teal-600 dark:text-teal-400' },
            ].map(({ label, value, icon: Icon, gradient, iconColor }) => (
              <div key={label} className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}><Icon className={`h-7 w-7 ${iconColor}`} /></div>
                <div className="min-w-0"><p className="text-2xl font-bold tabular-nums text-foreground">{formatCompactNumber(value)}</p><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* Card stats */}
        {cardStats && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 shadow-inner"><CreditCard className="h-6 w-6 text-primary" /></div>
              <div><h2 className="text-2xl font-bold text-foreground tracking-tight">Kartlar özeti</h2><p className="text-sm text-muted-foreground mt-0.5">Fiziksel kart durumları</p></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Toplam', value: cardStats.total, bg: 'bg-slate-500/20', color: 'text-muted-foreground' },
                { label: 'Aktif', value: cardStats.ACTIVATED, bg: 'bg-amber-500/20', color: 'text-amber-600 dark:text-amber-400' },
                { label: 'Kullanılmamış', value: cardStats.UNUSED, bg: 'bg-zinc-500/20', color: 'text-zinc-600 dark:text-zinc-400' },
                { label: 'Bloke', value: cardStats.BLOCKED, bg: 'bg-red-500/20', color: 'text-red-600 dark:text-red-400' },
              ].map(({ label, value, bg, color }) => (
                <Card key={label} className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center`}><CreditCard className={`h-5 w-5 ${color}`} /></div>
                    <div><p className="text-xl font-bold tabular-nums text-foreground">{formatCompactNumber(value)}</p><p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p></div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex justify-end"><Link href="/admin/cards"><Button variant="outline" size="sm">Kartlar →</Button></Link></div>
          </section>
        )}

        {/* Tech & Integration */}
        {techSummary && (
          <section className="space-y-3 sm:space-y-4">
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-cyan-500/20 to-sky-600/20 flex items-center justify-center shadow-inner"><Radio className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-600 dark:text-cyan-400" /></div>
              <div><h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Teknoloji & Entegrasyon</h2><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Özellik bayrakları, webhook&apos;lar ve API anahtarları</p></div>
              <Link href="/admin/tech/add" className="ml-auto"><Button variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" />Ekle</Button></Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
              <Link href="/admin/features"><Card className="group h-full border border-border bg-card/80 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 dark:bg-card/90"><CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4 md:p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 transition-transform group-hover:scale-105 sm:h-14 sm:w-14 sm:rounded-2xl"><ToggleLeft className="h-6 w-6 text-primary sm:h-7 sm:w-7" /></div><div className="min-w-0 flex-1"><p className="text-2xl font-bold tabular-nums text-foreground">{techSummary.features.total}</p><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Özellik bayrakları</p><p className="text-xs text-muted-foreground mt-0.5"><span className="text-green-600 dark:text-green-400 font-medium">{techSummary.features.enabled} açık</span> · {techSummary.features.disabled} kapalı</p></div></CardContent></Card></Link>
              <Link href="/admin/webhooks"><Card className="h-full border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 group"><CardContent className="p-3 sm:p-4 md:p-5 flex items-center gap-3 sm:gap-4"><div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"><Link2 className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600 dark:text-emerald-400" /></div><div className="min-w-0 flex-1"><p className="text-2xl font-bold tabular-nums text-foreground">{techSummary.webhooks.total}</p><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Webhook</p><p className="text-xs text-muted-foreground mt-0.5"><span className="text-green-600 dark:text-green-400 font-medium">{techSummary.webhooks.active} aktif</span></p></div></CardContent></Card></Link>
              <Link href="/admin/api-keys"><Card className="h-full border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 group"><CardContent className="p-3 sm:p-4 md:p-5 flex items-center gap-3 sm:gap-4"><div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"><Key className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600 dark:text-amber-400" /></div><div className="min-w-0 flex-1"><p className="text-2xl font-bold tabular-nums text-foreground">{techSummary.apiKeys.total}</p><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">API anahtarı</p></div></CardContent></Card></Link>
            </div>
          </section>
        )}

        {/* Segments + Compliance */}
        <div className="grid items-stretch gap-3 sm:gap-4 md:gap-6 lg:grid-cols-2 mb-6 sm:mb-8 md:mb-10">
          {segmentSummary && segmentSummary.length > 0 && (
            <section className="space-y-3 sm:space-y-4 h-full">
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 flex items-center justify-center shadow-inner"><UserCheck className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" /></div>
                <div><h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Müşteri segmentleri</h2><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">VIP, sadık, aktif, yeni, riskli, pasif</p></div>
              </div>
              <Card className="h-full border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg">
                <CardContent className="p-3 sm:p-4 md:p-5">
                  <div className="flex flex-wrap gap-3">
                    {segmentSummary.map((seg) => {
                      const colorClass = { amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', emerald: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300', blue: 'bg-blue-500/15 text-blue-800 dark:text-blue-300', violet: 'bg-primary/15 text-primary', red: 'bg-red-500/15 text-red-800 dark:text-red-300', gray: 'bg-muted text-muted-foreground' }[seg.color] || 'bg-muted text-muted-foreground';
                      return <Link key={seg.id} href="/admin/segments"><Badge variant="secondary" className={`px-3 py-1.5 text-sm font-medium cursor-pointer hover:opacity-90 border-0 ${colorClass}`}><span className="mr-1.5">{seg.icon}</span>{seg.name} {seg.count}</Badge></Link>;
                    })}
                  </div>
                  <div className="mt-3 flex justify-end"><Link href="/admin/segments"><Button variant="ghost" size="sm">Segmentler →</Button></Link></div>
                </CardContent>
              </Card>
            </section>
          )}
          {complianceOverview && (
            <section className="space-y-3 sm:space-y-4 h-full">
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-500/20 to-zinc-600/20 flex items-center justify-center shadow-inner"><Shield className="h-5 w-5 sm:h-6 sm:w-6 text-slate-600 dark:text-slate-400" /></div>
                <div><h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Uyumluluk özeti</h2><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">KVKK & 5651 log kapsamı</p></div>
              </div>
              <Card className="h-full border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg">
                <CardContent className="p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-xl bg-muted/50"><p className="text-xs text-muted-foreground uppercase tracking-wide">Denetim log</p><p className="text-lg font-bold tabular-nums">{formatCompactNumber(complianceOverview.logging.auditCoverage.totalAuditLogs)}</p><p className="text-xs text-muted-foreground">IP: %{complianceOverview.logging.auditCoverage.withIpPercent} · UA: %{complianceOverview.logging.auditCoverage.withUserAgentPercent}</p></div>
                    <div className="p-3 rounded-xl bg-muted/50"><p className="text-xs text-muted-foreground uppercase tracking-wide">Kart denetim</p><p className="text-lg font-bold tabular-nums">{formatCompactNumber(complianceOverview.logging.cardAuditCoverage.totalCardAuditLogs)}</p><p className="text-xs text-muted-foreground">IP: %{complianceOverview.logging.cardAuditCoverage.withIpPercent}</p></div>
                  </div>
                  {(complianceOverview.summary.unresolvedSuspicious > 0 || complianceOverview.summary.activeSuspiciousLast30d > 0) && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="text-sm"><p className="font-medium text-foreground">Şüpheli aktivite</p><p className="text-muted-foreground">Çözülmemiş: {complianceOverview.summary.unresolvedSuspicious} · Son 30 gün: {complianceOverview.summary.activeSuspiciousLast30d}</p></div>
                    </div>
                  )}
                  <div className="flex justify-end"><Link href="/admin/compliance"><Button variant="outline" size="sm">Uyumluluk →</Button></Link></div>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        {/* Audit log */}
        {auditRecent.length > 0 && (
          <section className="relative z-10 mt-8 sm:mt-10 md:mt-12 border-t border-border/50 pt-6 sm:pt-8 md:pt-10 space-y-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-600/20 flex items-center justify-center shadow-inner"><ClipboardList className="h-6 w-6 text-orange-600 dark:text-orange-400" /></div>
              <div><h2 className="text-2xl font-bold text-foreground tracking-tight">Son denetim kayıtları</h2><p className="text-sm text-muted-foreground mt-0.5">En son sistem olayları</p></div>
            </div>
            <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
              <CardContent className="p-0">
                <ul className="divide-y max-h-72 overflow-y-auto">
                  {auditRecent.map((entry) => (
                    <li key={entry.id} className="px-5 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground shrink-0 w-20 truncate" title={entry.entity}>{entry.entity}</span>
                      <span className="text-sm font-medium text-foreground">{entry.action}</span>
                      {entry.user && <span className="text-xs text-muted-foreground truncate flex-1">{entry.user.email}</span>}
                      <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(entry.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <div className="flex justify-end"><Link href="/admin/audit"><Button variant="outline" size="sm">Tüm denetim günlüğü →</Button></Link></div>
          </section>
        )}

        {/* Quick access */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 shadow-inner"><Link2 className="h-6 w-6 text-primary" /></div>
            <div><h2 className="text-2xl font-bold text-foreground tracking-tight">Hızlı erişim</h2><p className="text-sm text-muted-foreground mt-0.5">Tüm admin sayfalarına kısayollar</p></div>
          </div>
          <QuickAccessGrid items={HIZLI_ERISIM} />
        </section>
      </main>
    </div>
  );
}
