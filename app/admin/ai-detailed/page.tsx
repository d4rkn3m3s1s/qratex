'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Brain,
  Loader2,
  Shield,
  Target,
  AlertTriangle,
  Activity,
  Users,
  ThumbsUp,
  ThumbsDown,
  Minus,
  BarChart3,
  Hash,
  Star,
  Zap,
  Eye,
  FileText,
  Layers,
  Lightbulb,
  MessageSquare,
  CheckCircle2,
  Search,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

interface DetailedSignals {
  intentDist: Record<string, number>;
  urgencyBuckets: Record<string, number>;
  churnBuckets: Record<string, number>;
  avgEffort: number;
  avgUrgency: number;
  avgChurnRisk: number;
  topEntities: { name: string; type: string; count: number; posRate: number; negRate: number; neuRate: number }[];
  topEmotions: { emotion: string; count: number }[];
  topActions: { action: string; priority: string; impact: string; category: string; count: number }[];
  topThemes: { theme: string; subTheme?: string; count: number; avgScore: number; posRate: number; negRate: number }[];
  ratingDist: Record<number, number>;
  sentimentByRating: Record<number, { positive: number; negative: number; neutral: number }>;
  totalAnalyzed: number;
  totalFeedbacks: number;
}

const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(value, 100)}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }} className={`h-full rounded-full ${color}`} />
  </div>
);

const getPriorityColor = (p: string) => {
  switch (p) { case 'critical': return 'bg-red-500/10 text-red-500'; case 'high': return 'bg-orange-500/10 text-orange-500'; case 'medium': return 'bg-yellow-500/10 text-yellow-500'; default: return 'bg-blue-500/10 text-blue-500'; }
};

export default function AdminAIDetailedPage() {
  const { data: queryData, isLoading: loading, refetch } = useQuery<{ success: boolean; signals: DetailedSignals }>({
    queryKey: ['admin', 'ai-detailed'],
    queryFn: async () => {
      const res = await fetch('/api/ai/detailed');
      const data = await res.json();
      if (!data.success) throw new Error('Detaylı veriler yüklenemedi');
      return data;
    },
    staleTime: 60_000,
  });

  const signals = queryData?.signals ?? null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Derin AI analiz verileri yükleniyor...</p>
      </div>
    );
  }

  if (!signals) {
    return <div className="text-center py-12 text-muted-foreground">Veri bulunamadı</div>;
  }

  const intentTotal = Object.values(signals.intentDist).reduce((a, b) => a + b, 0);
  const urgencyTotal = Object.values(signals.urgencyBuckets).reduce((a, b) => a + b, 0);
  const churnTotal = Object.values(signals.churnBuckets).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 pb-8">
      <AdminPremiumHero
        eyebrow="Derin analiz"
        title={
          <span className="flex items-center gap-3">
            <Brain className="w-8 h-8 shrink-0" /> AI Detaylı Analiz Merkezi
          </span>
        }
        description="Sistem geneli Experience Signals, NLP ve derin öğrenme metrikleri"
        icon={<Shield className="text-white" />}
        actions={
          <Button onClick={() => refetch()} className="bg-white text-emerald-900 hover:bg-white/90 shadow-md">
            <RefreshCw className="h-4 w-4 mr-2" /> Yenile
          </Button>
        }
        aside={
          <div className="flex flex-wrap gap-2 justify-end">
            <div className="rounded-xl px-4 py-2 text-center border min-w-[5.5rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">Toplam</span>
              <p className="text-2xl font-bold tabular-nums">{signals.totalFeedbacks}</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center border min-w-[5.5rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">Analiz edilmiş</span>
              <p className="text-2xl font-bold tabular-nums">{signals.totalAnalyzed}</p>
            </div>
          </div>
        }
      />

      {/* Experience Signal Averages */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Ort. Aciliyet', value: (signals.avgUrgency * 10).toFixed(1), max: '10', color: signals.avgUrgency > 0.5 ? 'text-red-500' : 'text-emerald-500', icon: AlertTriangle },
          { label: 'Ort. Efor Skoru', value: (signals.avgEffort * 10).toFixed(1), max: '10', color: signals.avgEffort > 0.5 ? 'text-red-500' : 'text-emerald-500', icon: Activity },
          { label: 'Ort. Churn Riski', value: (signals.avgChurnRisk * 100).toFixed(0) + '%', max: '', color: signals.avgChurnRisk > 0.5 ? 'text-red-500' : 'text-emerald-500', icon: Users },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 text-center">
                  <Icon className={`h-6 w-6 mx-auto mb-2 ${item.color}`} />
                  <p className={`text-2xl sm:text-3xl font-bold ${item.color}`}>{item.value}{item.max ? `/${item.max}` : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Intent Distribution & Urgency & Churn */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Intent */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="h-5 w-5 text-orange-500" /> Niyet Dağılımı</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'complaint', label: 'Şikâyet', color: 'bg-red-500' },
                { key: 'suggestion', label: 'Öneri', color: 'bg-yellow-500' },
                { key: 'praise', label: 'Övgü', color: 'bg-emerald-500' },
                { key: 'question', label: 'Soru', color: 'bg-blue-500' },
                { key: 'general', label: 'Genel', color: 'bg-gray-500' },
              ].map((item, idx) => (
                <div key={item.key} className="flex items-center gap-3">
                  <span className="w-14 sm:w-16 text-xs font-medium">{item.label}</span>
                  <div className="flex-1"><AnimatedProgress value={intentTotal > 0 ? ((signals.intentDist[item.key] || 0) / intentTotal) * 100 : 0} color={item.color} delay={0.2 + idx * 0.05} /></div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{signals.intentDist[item.key] || 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Urgency */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-red-500" /> Aciliyet Dağılımı</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'low', label: 'Düşük', color: 'bg-emerald-500' },
                { key: 'medium', label: 'Orta', color: 'bg-yellow-500' },
                { key: 'high', label: 'Yüksek', color: 'bg-orange-500' },
                { key: 'critical', label: 'Kritik', color: 'bg-red-500' },
              ].map((item, idx) => (
                <div key={item.key} className="flex items-center gap-3">
                  <span className="w-14 sm:w-16 text-xs font-medium">{item.label}</span>
                  <div className="flex-1"><AnimatedProgress value={urgencyTotal > 0 ? ((signals.urgencyBuckets[item.key] || 0) / urgencyTotal) * 100 : 0} color={item.color} delay={0.25 + idx * 0.05} /></div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{signals.urgencyBuckets[item.key] || 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Churn Risk */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-destructive" /> Churn Risk Dağılımı</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'safe', label: 'Güvenli', color: 'bg-emerald-500' },
                { key: 'low', label: 'Düşük', color: 'bg-blue-500' },
                { key: 'medium', label: 'Orta', color: 'bg-yellow-500' },
                { key: 'high', label: 'Yüksek', color: 'bg-red-500' },
              ].map((item, idx) => (
                <div key={item.key} className="flex items-center gap-3">
                  <span className="w-14 sm:w-16 text-xs font-medium">{item.label}</span>
                  <div className="flex-1"><AnimatedProgress value={churnTotal > 0 ? ((signals.churnBuckets[item.key] || 0) / churnTotal) * 100 : 0} color={item.color} delay={0.3 + idx * 0.05} /></div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{signals.churnBuckets[item.key] || 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top Entities & Themes */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Entities */}
        {signals.topEntities.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" aria-hidden /> Varlık Tanıma (NER)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {signals.topEntities.slice(0, 12).map((ent, i) => (
                    <motion.div key={`${ent.type}-${ent.name}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.03 }}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/20"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{ent.type}</Badge>
                        <span className="text-sm font-medium">{ent.name}</span>
                        <span className="text-xs text-muted-foreground">({ent.count})</span>
                      </div>
                      <div className="flex gap-1">
                        <span className="text-xs text-emerald-500">👍{ent.posRate}%</span>
                        <span className="text-xs text-red-500">👎{ent.negRate}%</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Themes */}
        {signals.topThemes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> Tema Analizi</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {signals.topThemes.slice(0, 10).map((theme, i) => (
                    <motion.div key={`${theme.theme}-${theme.subTheme || ''}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.03 }}
                      className="p-3 rounded-lg bg-muted/20"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{theme.theme}</span>
                          {theme.subTheme && <span className="text-xs text-muted-foreground ml-1">&gt; {theme.subTheme}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" />{theme.count}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" />{(theme.avgScore * 5).toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="mt-1 h-2 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500" style={{ width: `${theme.posRate}%` }} />
                        <div className="bg-red-500" style={{ width: `${theme.negRate}%` }} />
                        <div className="bg-blue-300" style={{ width: `${100 - theme.posRate - theme.negRate}%` }} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Top Actions & Emotions */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Action Suggestions */}
        {signals.topActions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-yellow-500" /> AI Aksiyon Önerileri</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {signals.topActions.slice(0, 10).map((action, i) => (
                    <motion.div key={action.action} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 + i * 0.03 }}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/20"
                    >
                      <Badge className={`text-xs border-0 shrink-0 ${getPriorityColor(action.priority)}`}>{action.priority}</Badge>
                      <div className="flex-1">
                        <p className="text-sm">{action.action}</p>
                        {action.impact && <p className="text-xs text-muted-foreground mt-0.5">{action.impact}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{action.count}x</span>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Emotions */}
        {signals.topEmotions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Duygu Haritası</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {signals.topEmotions.slice(0, 10).map((emo, idx) => {
                  const maxCount = signals.topEmotions[0]?.count || 1;
                  return (
                    <div key={emo.emotion} className="flex items-center gap-3">
                      <span className="w-20 sm:w-24 text-sm font-medium capitalize truncate">{emo.emotion}</span>
                      <div className="flex-1"><AnimatedProgress value={(emo.count / maxCount) * 100} color="bg-primary" delay={0.5 + idx * 0.05} /></div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{emo.count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Rating Distribution */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-yellow-500" /> Puan Dağılımı & Duygu Analizi</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
              {[1, 2, 3, 4, 5].map(rating => {
                const count = signals.ratingDist[rating] || 0;
                const maxCount = Math.max(...Object.values(signals.ratingDist), 1);
                const sbr = signals.sentimentByRating[rating] || { positive: 0, negative: 0, neutral: 0 };
                const sbrTotal = sbr.positive + sbr.negative + sbr.neutral || 1;
                return (
                  <div key={rating} className="text-center">
                    <div className="flex items-center justify-center gap-0.5 mb-2">
                      {[...Array(rating)].map((_, i) => <Star key={i} className="h-3 w-3 text-yellow-500 fill-yellow-500" />)}
                    </div>
                    <div className="h-24 relative flex items-end justify-center">
                      <motion.div initial={{ height: 0 }} animate={{ height: `${(count / maxCount) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.5 + rating * 0.1 }}
                        className="w-10 max-h-full min-h-[4px] rounded-t-lg bg-gradient-to-t from-primary to-primary/80"
                      />
                    </div>
                    <p className="text-lg font-bold mt-1">{count}</p>
                    <div className="h-1.5 rounded-full overflow-hidden flex mt-1">
                      <div className="bg-emerald-500" style={{ width: `${(sbr.positive / sbrTotal) * 100}%` }} />
                      <div className="bg-blue-400" style={{ width: `${(sbr.neutral / sbrTotal) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(sbr.negative / sbrTotal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
