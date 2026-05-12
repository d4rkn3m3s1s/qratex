'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Settings,
  Save,
  Loader2,
  Sparkles,
  MessageSquare,
  Shield,
  Target,
  AlertTriangle,
  Activity,
  Zap,
  Users,
  BarChart3,
  Bell,
  FileText,
  Search,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
  GraduationCap,
  Database,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import Link from 'next/link';
import { useAppT } from '@/lib/app-locale';

interface AISettingsState {
  isEnabled: boolean;
  autoAnalyze: boolean;
  analysisLanguage: string;
  sentimentEnabled: boolean;
  emotionEnabled: boolean;
  topicEnabled: boolean;
  intentEnabled: boolean;
  urgencyEnabled: boolean;
  entityEnabled: boolean;
  toxicityEnabled: boolean;
  churnEnabled: boolean;
  themeClusterEnabled: boolean;
  weeklyReportEnabled: boolean;
  monthlyReportEnabled: boolean;
  alertOnToxic: boolean;
  alertOnUrgent: boolean;
  alertOnChurnRisk: boolean;
  customPrompt: string | null;
}

const defaultSettings: AISettingsState = {
  isEnabled: true,
  autoAnalyze: true,
  analysisLanguage: 'tr',
  sentimentEnabled: true,
  emotionEnabled: true,
  topicEnabled: true,
  intentEnabled: true,
  urgencyEnabled: true,
  entityEnabled: true,
  toxicityEnabled: true,
  churnEnabled: true,
  themeClusterEnabled: true,
  weeklyReportEnabled: true,
  monthlyReportEnabled: true,
  alertOnToxic: true,
  alertOnUrgent: true,
  alertOnChurnRisk: true,
  customPrompt: null,
};

const analysisFeatures = [
  { key: 'sentimentEnabled', icon: MessageSquare, color: 'text-blue-500' },
  { key: 'emotionEnabled', icon: Sparkles, color: 'text-primary' },
  { key: 'topicEnabled', icon: FileText, color: 'text-emerald-500' },
  { key: 'intentEnabled', icon: Target, color: 'text-orange-500' },
  { key: 'urgencyEnabled', icon: AlertTriangle, color: 'text-red-500' },
  { key: 'entityEnabled', icon: Search, color: 'text-cyan-500' },
  { key: 'toxicityEnabled', icon: Shield, color: 'text-yellow-500' },
  { key: 'churnEnabled', icon: Users, color: 'text-destructive' },
  { key: 'themeClusterEnabled', icon: BarChart3, color: 'text-primary' },
] as const;

const alertFeatures = [
  { key: 'alertOnToxic', icon: Shield, color: 'text-red-500' },
  { key: 'alertOnUrgent', icon: AlertTriangle, color: 'text-orange-500' },
  { key: 'alertOnChurnRisk', icon: Users, color: 'text-destructive' },
] as const;

const reportFeatures = [
  { key: 'weeklyReportEnabled', icon: FileText, color: 'text-blue-500' },
  { key: 'monthlyReportEnabled', icon: BarChart3, color: 'text-primary' },
] as const;

function DailyChart({ data, t }: { data: { date: string; label: string; count: number }[]; t: (key: string) => string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <motion.div
          key={d.date}
          initial={{ height: 0 }}
          animate={{ height: `${(d.count / max) * 100}%` }}
          transition={{ delay: i * 0.05, duration: 0.4 }}
          className="flex-1 min-w-0 flex flex-col items-center gap-0.5"
        >
          <span className="text-[10px] font-medium text-muted-foreground order-2">{d.label}</span>
          <div
            className="min-h-[4px] w-full rounded-t bg-gradient-to-t from-primary to-primary/70"
            title={t('dealerAiSettings.chartBarTooltip').replace('{date}', d.date).replace('{count}', String(d.count))}
          />
          <span className="text-[10px] font-medium order-1">{d.count}</span>
        </motion.div>
      ))}
    </div>
  );
}

export default function DealerAISettingsPage() {
  const t = useAppT();
  const [settings, setSettings] = useState<AISettingsState>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{
    analyzedFeedbackCount: number;
    analyzedLast24h: number;
    usageLogsLast7d: number;
    embeddingsCount: number;
    correctionsCount: number;
    learningProfile: { status: string; trainingFeedbackCount: number; correctionsUsed: number; lastTrainedAt: string | null } | null;
  } | null>(null);
  const [dailyAnalyzed, setDailyAnalyzed] = useState<{ date: string; label: string; count: number }[]>([]);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/dealer/ai-settings');
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (data.stats) setStats(data.stats);
      if (data.dailyAnalyzed) setDailyAnalyzed(data.dailyAnalyzed);
    } catch (e) {
      console.error('Failed to fetch AI settings:', e);
      toast.error(t('dealerAiSettings.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/dealer/ai-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('dealerAiSettings.toastSaved'));
        fetchData();
      } else {
        toast.error(t('dealerAiSettings.toastSaveFailed'));
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
      toast.error(t('dealerAiSettings.toastGenericError'));
    } finally {
      setSaving(false);
    }
  };

  const sentimentSubLayers = ['emotionEnabled', 'intentEnabled', 'urgencyEnabled'];

  const toggleSetting = (key: string) => {
    setSettings((prev) => {
      const newVal = !prev[key as keyof AISettingsState];
      const updates: Partial<AISettingsState> = { [key]: newVal };

      if (key === 'sentimentEnabled' && !newVal) {
        for (const sub of sentimentSubLayers) (updates as Record<string, boolean>)[sub] = false;
      }
      if (key === 'isEnabled' && !newVal) {
        for (const f of analysisFeatures) (updates as Record<string, boolean>)[f.key] = false;
        for (const f of alertFeatures) (updates as Record<string, boolean>)[f.key] = false;
        for (const f of reportFeatures) (updates as Record<string, boolean>)[f.key] = false;
        updates.autoAnalyze = false;
      }
      return { ...prev, ...updates };
    });
  };

  const enabledCount = analysisFeatures.filter((f) => settings[f.key as keyof AISettingsState]).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-36 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="h-40 rounded-xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerAiSettings.eyebrow')}
        title={t('dealerAiSettings.title')}
        description={t('dealerAiSettings.description')}
        icon={<Brain className="h-7 w-7" aria-hidden />}
        tone="auto"
        chips={
          <>
            <Badge variant="secondary" className="font-normal">
              {t('dealerAiSettings.chipsFeatures').replace('{enabled}', String(enabledCount)).replace('{total}', String(analysisFeatures.length))}
            </Badge>
            {stats ? (
              <Badge variant="secondary" className="font-normal">
                {t('dealerAiSettings.chipsAnalyzed').replace('{count}', String(stats.analyzedFeedbackCount))}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={fetchData}
              className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4 mr-2" /> {t('dealerAiSettings.refresh')}
            </Button>
            <Button type="button" onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? t('dealerAiSettings.saving') : t('dealerAiSettings.save')}
            </Button>
          </>
        }
      />

      {/* Stats */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="overflow-hidden border border-border/60 bg-card/50 shadow-md backdrop-blur-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dealerAiSettings.statAnalyzed')}</p>
                <p className="text-xl font-bold">{stats.analyzedFeedbackCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border border-border/60 bg-card/50 shadow-md backdrop-blur-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dealerAiSettings.statLast24h')}</p>
                <p className="text-xl font-bold">{stats.analyzedLast24h}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dealerAiSettings.statLearningProfile')}</p>
                <p className="text-sm font-bold">{stats.learningProfile?.status ?? t('dealerAiSettings.none')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('dealerAiSettings.statLearningMeta')
                    .replace('{training}', String(stats.learningProfile?.trainingFeedbackCount ?? 0))
                    .replace('{corrections}', String(stats.correctionsCount))}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <Database className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dealerAiSettings.statEmbedding')}</p>
                <p className="text-xl font-bold">{stats.embeddingsCount}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Daily chart */}
      {dailyAnalyzed.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                {t('dealerAiSettings.chartTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiSettings.chartDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyChart data={dailyAnalyzed} t={t} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Master Toggle */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="border-0 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${settings.isEnabled ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                  <Zap className={`h-6 w-6 ${settings.isEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{t('dealerAiSettings.engineTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{t('dealerAiSettings.engineDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={settings.isEnabled ? 'bg-emerald-500/10 text-emerald-500 border-0' : 'bg-muted text-muted-foreground border-0'}>
                  {settings.isEnabled ? t('dealerAiSettings.active') : t('dealerAiSettings.inactive')}
                </Badge>
                <Switch checked={settings.isEnabled} onCheckedChange={() => toggleSetting('isEnabled')} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Auto Analyze */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <Card className="border-0 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${settings.autoAnalyze ? 'bg-blue-500/10' : 'bg-muted'}`}>
                  <Activity className={`h-6 w-6 ${settings.autoAnalyze ? 'text-blue-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{t('dealerAiSettings.autoAnalyzeTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{t('dealerAiSettings.autoAnalyzeDescription')}</p>
                </div>
              </div>
              <Switch checked={settings.autoAnalyze} onCheckedChange={() => toggleSetting('autoAnalyze')} disabled={!settings.isEnabled} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Analysis Features */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              {t('dealerAiSettings.sectionAnalysisTitle')}
            </CardTitle>
            <CardDescription>{t('dealerAiSettings.sectionAnalysisDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {analysisFeatures.map((feature, index) => {
                const Icon = feature.icon;
                const isEnabled = settings[feature.key as keyof AISettingsState] as boolean;
                return (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.18 + index * 0.03 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      isEnabled ? 'bg-card border-border shadow-sm' : 'bg-muted/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEnabled ? 'bg-background' : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${!isEnabled && 'text-muted-foreground'}`}>{t(`dealerAiSettings.analysis.${feature.key}.label`)}</p>
                        <p className="text-sm text-muted-foreground">{t(`dealerAiSettings.analysis.${feature.key}.description`)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleSetting(feature.key)}
                        disabled={!settings.isEnabled || (sentimentSubLayers.includes(feature.key) && !settings.sentimentEnabled)}
                      />
                      {sentimentSubLayers.includes(feature.key) && !settings.sentimentEnabled && settings.isEnabled && (
                        <span className="text-[10px] text-muted-foreground">{t('dealerAiSettings.sentimentRequiredHint')}</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Alert Settings */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              {t('dealerAiSettings.sectionAlertsTitle')}
            </CardTitle>
            <CardDescription>{t('dealerAiSettings.sectionAlertsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {alertFeatures.map((feature, index) => {
                const Icon = feature.icon;
                const isEnabled = settings[feature.key as keyof AISettingsState] as boolean;
                return (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.47 + index * 0.03 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      isEnabled ? 'bg-card border-border shadow-sm' : 'bg-muted/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEnabled ? 'bg-background' : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${!isEnabled && 'text-muted-foreground'}`}>{t(`dealerAiSettings.alert.${feature.key}.label`)}</p>
                        <p className="text-sm text-muted-foreground">{t(`dealerAiSettings.alert.${feature.key}.description`)}</p>
                      </div>
                    </div>
                    <Switch checked={isEnabled} onCheckedChange={() => toggleSetting(feature.key)} disabled={!settings.isEnabled} />
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Report Settings */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              {t('dealerAiSettings.sectionReportsTitle')}
            </CardTitle>
            <CardDescription>{t('dealerAiSettings.sectionReportsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {reportFeatures.map((feature, index) => {
                const Icon = feature.icon;
                const isEnabled = settings[feature.key as keyof AISettingsState] as boolean;
                return (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.57 + index * 0.03 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      isEnabled ? 'bg-card border-border shadow-sm' : 'bg-muted/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEnabled ? 'bg-background' : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${!isEnabled && 'text-muted-foreground'}`}>{t(`dealerAiSettings.report.${feature.key}.label`)}</p>
                        <p className="text-sm text-muted-foreground">{t(`dealerAiSettings.report.${feature.key}.description`)}</p>
                      </div>
                    </div>
                    <Switch checked={isEnabled} onCheckedChange={() => toggleSetting(feature.key)} disabled={!settings.isEnabled} />
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Custom Prompt */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }}>
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-cyan-500" />
              {t('dealerAiSettings.customPromptTitle')}
            </CardTitle>
            <CardDescription>{t('dealerAiSettings.customPromptDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={t('dealerAiSettings.customPromptPlaceholder')}
              value={settings.customPrompt || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, customPrompt: e.target.value || null }))}
              rows={4}
              className="resize-none"
              disabled={!settings.isEnabled}
            />
            <p className="text-xs text-muted-foreground mt-2">{t('dealerAiSettings.customPromptFooter')}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Learning link */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
        <Link href="/dealer/ai-learning">
          <Card className="cursor-pointer border border-border/60 border-l-4 border-l-primary shadow-md transition-shadow hover:shadow-lg">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <GraduationCap className="h-6 w-6 text-primary" aria-hidden />
                <div>
                  <p className="font-medium">{t('dealerAiSettings.learningCardTitle')}</p>
                  <p className="text-sm text-muted-foreground">{t('dealerAiSettings.learningCardDescription')}</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">→</span>
            </CardContent>
          </Card>
        </Link>
      </motion.div>

      {/* Save Button */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          {saving ? t('dealerAiSettings.saving') : t('dealerAiSettings.saveFooter')}
        </Button>
      </motion.div>
    </div>
  );
}
