'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  MessageSquare,
  Loader2,
  Star,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Target,
  Activity,
  Shield,
  Zap,
  Heart,
  Smile,
  Frown,
  Meh,
  BarChart3,
  Eye,
  Users,
  Hash,
  Clock,
  FileText,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ── Types ──
interface FeedbackAnalysis {
  id: string;
  text: string;
  rating: number;
  sentiment: string;
  emotions: string[];
  topics: string[];
  intent: string | null;
  urgency: number | null;
  effortScore: number | null;
  churnRisk: number | null;
  isToxic: boolean;
  themes: { theme: string; subTheme?: string; sentiment: string; score: number }[];
  entities: { type: string; name: string; sentiment: string }[];
  statementSentiments: { statement: string; sentiment: string; score: number }[];
  actionSuggestions: { action: string; priority: string; impact: string; category: string }[];
  summary: string | null;
  createdAt: string;
  qrCodeName: string;
}

interface CustomerAIStats {
  totalFeedbacks: number;
  avgRating: number;
  sentimentDistribution: { positive: number; negative: number; neutral: number };
  topEmotions: { emotion: string; count: number }[];
  topTopics: { topic: string; count: number }[];
  feedbacks: FeedbackAnalysis[];
  overallSentiment: string;
  avgUrgency: number;
  avgEffort: number;
  avgChurnRisk: number;
}

// ── Animated Progress Bar ──
const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(value, 100)}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }}
      className={`h-full rounded-full ${color}`}
    />
  </div>
);

const getEmotionIcon = (emotion: string) => {
  switch (emotion) {
    case 'happy': case 'satisfied': case 'grateful': case 'excited': return Smile;
    case 'angry': case 'frustrated': case 'disappointed': return Frown;
    default: return Meh;
  }
};

const getEmotionColor = (emotion: string) => {
  switch (emotion) {
    case 'happy': case 'satisfied': case 'grateful': case 'excited': return 'text-emerald-500 bg-emerald-500/10';
    case 'angry': case 'frustrated': case 'disappointed': case 'sad': return 'text-red-500 bg-red-500/10';
    case 'confused': case 'worried': return 'text-yellow-500 bg-yellow-500/10';
    default: return 'text-blue-500 bg-blue-500/10';
  }
};

const getSentimentConfig = (sentiment: string) => {
  switch (sentiment) {
    case 'positive': return { icon: ThumbsUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Olumlu' };
    case 'negative': return { icon: ThumbsDown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Olumsuz' };
    default: return { icon: Minus, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Nötr' };
  }
};

const getIntentLabel = (intent: string) => {
  switch (intent) {
    case 'complaint': return { label: 'Şikâyet', color: 'text-red-500 bg-red-500/10' };
    case 'suggestion': return { label: 'Öneri', color: 'text-yellow-500 bg-yellow-500/10' };
    case 'praise': return { label: 'Övgü', color: 'text-emerald-500 bg-emerald-500/10' };
    case 'question': return { label: 'Soru', color: 'text-blue-500 bg-blue-500/10' };
    default: return { label: 'Genel', color: 'text-gray-500 bg-gray-500/10' };
  }
};

export default function CustomerAIInsightsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CustomerAIStats | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackAnalysis | null>(null);

  useEffect(() => {
    fetchMyAnalyses();
  }, []);

  const fetchMyAnalyses = async () => {
    try {
      const res = await fetch('/api/customer/ai-insights');
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch AI insights:', error);
      toast.error('AI analizleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">Geri bildirim analizleriniz yükleniyor...</p>
      </div>
    );
  }

  if (!stats || stats.totalFeedbacks === 0) {
    return (
      <div className="space-y-6 pb-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 p-6 md:p-8"
        >
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Sparkles className="w-8 h-8" /> Geri Bildirim Analizlerim
            </h1>
            <p className="text-white/70 mt-1">Henüz geri bildiriminiz bulunmuyor</p>
          </div>
        </motion.div>
        <Card className="border-0 bg-card/50">
          <CardContent className="p-12 text-center">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-xl font-bold mb-2">Henüz Analiz Yok</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              QR kod tarayarak geri bildirim bıraktığınızda, AI otomatik olarak geri bildiriminizi analiz edecek ve burada sonuçları gösterecektir.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [0, -15, 0], opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-white/80" />
            <span className="text-white/80 text-sm font-medium">AI Destekli</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Sparkles className="w-8 h-8" /> Geri Bildirim Analizlerim
          </h1>
          <p className="text-white/70 mt-1">
            Yapay zeka, geri bildirimlerinizi analiz ederek size kişisel içgörüler sunuyor
          </p>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Geri Bildirim', value: stats.totalFeedbacks, icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Ort. Puanım', value: `${stats.avgRating.toFixed(1)}/5`, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { label: 'Genel Duygu', value: stats.overallSentiment === 'positive' ? 'Olumlu' : stats.overallSentiment === 'negative' ? 'Olumsuz' : 'Nötr', icon: stats.overallSentiment === 'positive' ? ThumbsUp : stats.overallSentiment === 'negative' ? ThumbsDown : Minus, color: stats.overallSentiment === 'positive' ? 'text-emerald-500' : stats.overallSentiment === 'negative' ? 'text-red-500' : 'text-blue-500', bg: stats.overallSentiment === 'positive' ? 'bg-emerald-500/10' : stats.overallSentiment === 'negative' ? 'bg-red-500/10' : 'bg-blue-500/10' },
          { label: 'Ort. Efor Skoru', value: `${(stats.avgEffort * 10).toFixed(0)}/10`, icon: Activity, color: stats.avgEffort > 0.5 ? 'text-red-500' : 'text-emerald-500', bg: stats.avgEffort > 0.5 ? 'bg-red-500/10' : 'bg-emerald-500/10' },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Card className="border-0 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <div className={`p-2 rounded-lg ${item.bg} w-fit mx-auto mb-2`}>
                    <Icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Sentiment Distribution */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-violet-500" /> Duygu Dağılımım
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <ThumbsUp className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                <p className="text-2xl font-bold text-emerald-500">{stats.sentimentDistribution.positive}%</p>
                <p className="text-xs text-muted-foreground">Olumlu</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <Minus className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold text-blue-500">{stats.sentimentDistribution.neutral}%</p>
                <p className="text-xs text-muted-foreground">Nötr</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                <ThumbsDown className="h-5 w-5 mx-auto text-red-500 mb-1" />
                <p className="text-2xl font-bold text-red-500">{stats.sentimentDistribution.negative}%</p>
                <p className="text-xs text-muted-foreground">Olumsuz</p>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex">
              <motion.div initial={{ width: 0 }} animate={{ width: `${stats.sentimentDistribution.positive}%` }} transition={{ duration: 1 }} className="bg-emerald-500" />
              <motion.div initial={{ width: 0 }} animate={{ width: `${stats.sentimentDistribution.neutral}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-blue-400" />
              <motion.div initial={{ width: 0 }} animate={{ width: `${stats.sentimentDistribution.negative}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-red-500" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Emotions & Topics */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Emotions */}
        {stats.topEmotions.length > 0 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Heart className="h-5 w-5 text-pink-500" /> En Sık Duygularım
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.topEmotions.slice(0, 6).map((emotion, index) => {
                  const EmotionIcon = getEmotionIcon(emotion.emotion);
                  const colorClass = getEmotionColor(emotion.emotion);
                  return (
                    <motion.div key={emotion.emotion} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + index * 0.05 }} className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${colorClass.split(' ')[1]}`}>
                        <EmotionIcon className={`h-4 w-4 ${colorClass.split(' ')[0]}`} />
                      </div>
                      <span className="w-24 text-sm font-medium capitalize">{emotion.emotion}</span>
                      <div className="flex-1">
                        <AnimatedProgress value={(emotion.count / stats.totalFeedbacks) * 100} color={colorClass.includes('emerald') ? 'bg-emerald-500' : colorClass.includes('red') ? 'bg-red-500' : 'bg-blue-500'} delay={0.4 + index * 0.05} />
                      </div>
                      <span className="text-xs text-muted-foreground">{emotion.count}</span>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Top Topics */}
        {stats.topTopics.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-blue-500" /> En Çok Bahsettiğim Konular
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.topTopics.slice(0, 6).map((topic, index) => {
                  const maxCount = stats.topTopics[0]?.count || 1;
                  return (
                    <motion.div key={topic.topic} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + index * 0.05 }} className="flex items-center gap-3">
                      <span className="w-24 text-sm font-medium capitalize">{topic.topic}</span>
                      <div className="flex-1">
                        <AnimatedProgress value={(topic.count / maxCount) * 100} color="bg-blue-500" delay={0.4 + index * 0.05} />
                      </div>
                      <span className="text-xs text-muted-foreground">{topic.count}</span>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* My Feedback Analyses */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-500" /> Geri Bildirimlerimin AI Analizi
            </CardTitle>
            <CardDescription>Her geri bildiriminizin AI tarafından yapılan detaylı analizi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.feedbacks.map((fb, index) => {
              const sentimentConfig = getSentimentConfig(fb.sentiment);
              const SentimentIcon = sentimentConfig.icon;
              const isSelected = selectedFeedback?.id === fb.id;

              return (
                <motion.div
                  key={fb.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 + index * 0.05 }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-violet-500/5 border-violet-500/30' : 'bg-card hover:border-violet-500/20'}`}
                  onClick={() => setSelectedFeedback(isSelected ? null : fb)}
                >
                  {/* Summary Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{fb.text}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{fb.qrCodeName}</Badge>
                        <Badge className={`text-xs border-0 ${sentimentConfig.bg} ${sentimentConfig.color}`}>
                          <SentimentIcon className="h-3 w-3 mr-1" />
                          {sentimentConfig.label}
                        </Badge>
                        {fb.intent && (
                          <Badge className={`text-xs border-0 ${getIntentLabel(fb.intent).color}`}>
                            {getIntentLabel(fb.intent).label}
                          </Badge>
                        )}
                        {fb.emotions.slice(0, 2).map(e => (
                          <Badge key={e} className={`text-xs border-0 ${getEmotionColor(e)}`}>{e}</Badge>
                        ))}
                        {fb.urgency !== null && fb.urgency > 0.5 && (
                          <Badge className="text-xs bg-red-500/10 text-red-500 border-0">⚠️ Acil</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`h-3 w-3 ${s <= fb.rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(fb.createdAt).toLocaleDateString('tr-TR')}</p>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isSelected && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 pt-4 border-t space-y-4">
                      {/* AI Summary */}
                      {fb.summary && (
                        <div className="p-3 rounded-lg bg-violet-500/5">
                          <p className="text-xs font-medium text-violet-500 mb-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> AI Özet
                          </p>
                          <p className="text-sm text-muted-foreground">{fb.summary}</p>
                        </div>
                      )}

                      {/* Experience Signals */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {fb.urgency !== null && (
                          <div className="p-2 rounded-lg bg-muted/30 text-center">
                            <p className="text-xs text-muted-foreground">Aciliyet</p>
                            <p className={`text-lg font-bold ${fb.urgency > 0.7 ? 'text-red-500' : fb.urgency > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                              {(fb.urgency * 10).toFixed(0)}/10
                            </p>
                          </div>
                        )}
                        {fb.effortScore !== null && (
                          <div className="p-2 rounded-lg bg-muted/30 text-center">
                            <p className="text-xs text-muted-foreground">Efor</p>
                            <p className={`text-lg font-bold ${fb.effortScore > 0.7 ? 'text-red-500' : fb.effortScore > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                              {(fb.effortScore * 10).toFixed(0)}/10
                            </p>
                          </div>
                        )}
                        {fb.churnRisk !== null && (
                          <div className="p-2 rounded-lg bg-muted/30 text-center">
                            <p className="text-xs text-muted-foreground">Kaybetme Riski</p>
                            <p className={`text-lg font-bold ${fb.churnRisk > 0.7 ? 'text-red-500' : fb.churnRisk > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                              {(fb.churnRisk * 100).toFixed(0)}%
                            </p>
                          </div>
                        )}
                        {fb.topics.length > 0 && (
                          <div className="p-2 rounded-lg bg-muted/30 text-center">
                            <p className="text-xs text-muted-foreground">Konular</p>
                            <p className="text-sm font-medium mt-1">{fb.topics.join(', ')}</p>
                          </div>
                        )}
                      </div>

                      {/* Statement Sentiments */}
                      {fb.statementSentiments.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Cümle Bazlı Duygu Analizi</p>
                          <div className="space-y-2">
                            {fb.statementSentiments.map((ss, i) => {
                              const ssConfig = getSentimentConfig(ss.sentiment);
                              return (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <Badge className={`text-xs shrink-0 border-0 ${ssConfig.bg} ${ssConfig.color}`}>{ssConfig.label}</Badge>
                                  <span className="text-muted-foreground">&ldquo;{ss.statement}&rdquo;</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Entities */}
                      {fb.entities.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Tespit Edilen Varlıklar</p>
                          <div className="flex flex-wrap gap-2">
                            {fb.entities.map((entity, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {entity.name} ({entity.type}) - {entity.sentiment === 'positive' ? '👍' : entity.sentiment === 'negative' ? '👎' : '➖'}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Themes */}
                      {fb.themes.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Temalar</p>
                          <div className="flex flex-wrap gap-2">
                            {fb.themes.map((theme, i) => (
                              <Badge key={i} className={`text-xs border ${theme.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : theme.sentiment === 'negative' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-blue-500/10 text-blue-500 border-blue-500/30'}`}>
                                {theme.theme}{theme.subTheme ? ` > ${theme.subTheme}` : ''}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
