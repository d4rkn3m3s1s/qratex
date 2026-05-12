'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  MessageSquare,
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
  Send,
  Bot,
  User,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { normalizeSentimentTriplet } from '@/lib/sentiment-percentages';

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

interface RecommendationData {
  recommendations: string | null;
  stats: {
    totalFeedbacks: number;
    avgRating: number;
    sentimentDist: { positive: number; negative: number; neutral: number };
    ratingTrend: string;
    ratingTrendValue: number;
    avgUrgency: number;
    avgEffort: number;
    avgChurnRisk: number;
    topTopics: { topic: string; count: number }[];
    topBusinesses: { name: string; count: number }[];
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ── Helpers ──
const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(value, 100)}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }} className={`h-full rounded-full ${color}`} />
  </div>
);

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
  const { data: statsData, isLoading: loading, isError } = useQuery({
    queryKey: ['customer', 'ai-insights'],
    queryFn: async () => {
      const res = await fetch('/api/customer/ai-insights', { credentials: 'same-origin' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'AI analizleri yüklenemedi');
      return data as CustomerAIStats;
    },
    staleTime: 60_000,
  });
  const stats = statsData ?? null;
  const normalizedSentiment = stats
    ? normalizeSentimentTriplet({
        positive: stats.sentimentDistribution.positive ?? 0,
        neutral: stats.sentimentDistribution.neutral ?? 0,
        negative: stats.sentimentDistribution.negative ?? 0,
      })
    : { positive: 0, neutral: 0, negative: 0 };

  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'chat' | 'recommendations'>('overview');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Recommendations state
  const [recData, setRecData] = useState<RecommendationData | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [aiAnalysisLimit, setAiAnalysisLimit] = useState(5);

  useEffect(() => { if (isError) toast.error('AI analizleri yüklenemedi'); }, [isError]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const fetchRecommendations = async () => {
    setRecLoading(true);
    try {
      const res = await fetch('/api/customer/ai-recommendations');
      const data = await res.json();
      if (data.success) setRecData(data);
    } catch {
      toast.error('AI önerileri yüklenemedi');
    } finally {
      setRecLoading(false);
    }
  };

  const sendChatMessage = async (text?: string) => {
    const message = (text || chatInput).trim();
    if (!message || chatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: message, timestamp: new Date().toISOString() }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/customer/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: message, ...(conversationId ? { conversationId } : {}) }),
      });
      const data = await res.json();
      if (data.success && data.answer) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.answer, timestamp: new Date().toISOString() }]);
        if (data.conversationId) setConversationId(data.conversationId);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Bir hata oluştu.', timestamp: new Date().toISOString() }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Bağlantı hatası.', timestamp: new Date().toISOString() }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <InlineLoadingStatus
        className="min-h-[420px]"
        spinnerClassName="h-10 w-10 text-primary"
        description="Geri bildirim analizleriniz yükleniyor..."
      />
    );
  }

  if (!stats || stats.totalFeedbacks === 0) {
    return (
      <div className="space-y-6 pb-8">
        <DashboardPageHero
          eyebrow="Müşteri alanı"
          title="Geri Bildirim Analizlerim"
          description="Henüz geri bildiriminiz bulunmuyor"
          icon={<Sparkles className="h-7 w-7" aria-hidden />}
          tone="auto"
        />
        <Card className="border-border/60 bg-card/50">
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
      <DashboardPageHero
        eyebrow="Müşteri alanı · Kişisel AI"
        title="Geri Bildirim Analizlerim"
        description="Yapay zeka, geri bildirimlerinizi derin öğrenme ile analiz ederek size kişisel içgörüler sunuyor."
        icon={<Sparkles className="h-7 w-7" aria-hidden />}
        tone="auto"
      />

      {/* Tab Navigation */}
      <div className="flex gap-2">
        {[
          { key: 'overview', label: 'Genel Bakış', icon: BarChart3 },
          { key: 'chat', label: 'AI Sohbet', icon: MessageSquare },
          { key: 'recommendations', label: 'AI Öneriler', icon: Lightbulb },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <Button key={tab.key} variant={activeTab === tab.key ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab(tab.key as typeof activeTab);
                if (tab.key === 'recommendations' && !recData) fetchRecommendations();
              }}
              className="flex items-center gap-2"
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </Button>
          );
        })}
      </div>

      {/* ─── TAB: AI Chat ─── */}
      {activeTab === 'chat' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5 text-primary" /> AI Asistanım
              </CardTitle>
              <CardDescription>Geri bildirimleriniz hakkında AI&apos;a her şeyi sorun</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto space-y-3 mb-4 p-3 rounded-xl bg-muted/30">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Geri bildirimleriniz hakkında AI&apos;a soru sorun.</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {['En çok hangi konuda yorum yaptım?', 'Memnuniyet trendim nasıl?', 'Hangi işletmelere olumlu feedback verdim?', 'Geri bildirimlerimde en sık hangi duygu var?'].map(q => (
                        <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => sendChatMessage(q)}>
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="p-2 rounded-lg bg-primary/10 h-fit"><Bot className="h-4 w-4 text-primary" /></div>
                    )}
                    <div className={`max-w-[80%] p-3 rounded-xl text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="p-2 rounded-lg bg-primary/10 h-fit"><User className="h-4 w-4 text-primary" /></div>
                    )}
                  </motion.div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 h-fit"><Bot className="h-4 w-4 text-primary" /></div>
                    <div className="bg-card border p-3 rounded-xl">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2">
                <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                  placeholder="Geri bildirimleriniz hakkında sorun..." disabled={chatLoading} className="flex-1"
                />
                <Button onClick={() => sendChatMessage()} disabled={chatLoading || !chatInput.trim()} size="icon"><Send className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ─── TAB: Recommendations ─── */}
      {activeTab === 'recommendations' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {recLoading ? (
            <InlineLoadingStatus
              className="py-12"
              spinnerClassName="text-primary"
              description="AI kişisel önerilerinizi hazırlıyor..."
            />
          ) : recData ? (
            <>
              {/* Trend — yön önemli, büyük puan grid’i yok */}
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {recData.stats.ratingTrend === 'up' ? <TrendingUp className="h-5 w-5 text-emerald-500" /> :
                     recData.stats.ratingTrend === 'down' ? <TrendingDown className="h-5 w-5 text-red-500" /> :
                     <Activity className="h-5 w-5 text-blue-500" />}
                    Memnuniyet trendi
                  </CardTitle>
                  <CardDescription>
                    {recData.stats.ratingTrend === 'up' && 'Son dönemde genel eğiliminiz olumlu yönde.'}
                    {recData.stats.ratingTrend === 'down' && 'Son dönemde geri bildirim tonunuz biraz düşüş gösteriyor; bu normal dalgalanma olabilir.'}
                    {recData.stats.ratingTrend !== 'up' && recData.stats.ratingTrend !== 'down' &&
                      'Geri bildirimlerinizde belirgin bir yükseliş veya düşüş yok; dengeli bir çizgi.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      {recData.stats.ratingTrend === 'up' ? (
                        <><span className="text-emerald-500">↑</span> Yükseliş eğilimi</>
                      ) : recData.stats.ratingTrend === 'down' ? (
                        <><span className="text-red-500">↓</span> Düşüş eğilimi</>
                      ) : (
                        <><span className="text-blue-500">→</span> Stabil</>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      (Son kayıtlara göre yön; tek tek puanlar daha az önemli.)
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* AI Recommendations */}
              {recData.recommendations && (
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-500" /> Kişisel AI Önerilerim
                    </CardTitle>
                    <CardDescription>AI, geri bildirim geçmişinize dayalı öneriler hazırladı</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10"><Sparkles className="h-5 w-5 text-primary" /></div>
                        <div className="text-sm whitespace-pre-wrap">{recData.recommendations}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Businesses */}
              {recData.stats.topBusinesses.length > 0 && (
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Heart className="h-5 w-5 text-primary" /> En Çok Gittiğim İşletmeler
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {recData.stats.topBusinesses.map((biz, i) => (
                      <div key={biz.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{i + 1}</span>
                          <span className="text-sm font-medium">{biz.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{biz.count} ziyaret</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Button onClick={fetchRecommendations} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" /> Önerileri Yenile
              </Button>
            </>
          ) : (
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Öneriler yüklenirken bir sorun oluştu</p>
                <Button onClick={fetchRecommendations} variant="outline" className="mt-4">Tekrar Dene</Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* ─── TAB: Overview ─── */}
      {activeTab === 'overview' && (
        <>
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
                  <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-primary" /> Duygu Dağılımım
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
                  <div className="text-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <ThumbsUp className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                    <p className="text-lg sm:text-2xl font-bold text-emerald-500">{normalizedSentiment.positive}%</p>
                    <p className="text-xs text-muted-foreground">Olumlu</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                    <Minus className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                    <p className="text-lg sm:text-2xl font-bold text-blue-500">{normalizedSentiment.neutral}%</p>
                    <p className="text-xs text-muted-foreground">Nötr</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                    <ThumbsDown className="h-5 w-5 mx-auto text-red-500 mb-1" />
                    <p className="text-lg sm:text-2xl font-bold text-red-500">{normalizedSentiment.negative}%</p>
                    <p className="text-xs text-muted-foreground">Olumsuz</p>
                  </div>
                </div>
                <div className="h-3 rounded-full overflow-hidden flex">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${normalizedSentiment.positive}%` }} transition={{ duration: 1 }} className="bg-emerald-500" />
                  <motion.div initial={{ width: 0 }} animate={{ width: `${normalizedSentiment.neutral}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-blue-400" />
                  <motion.div initial={{ width: 0 }} animate={{ width: `${normalizedSentiment.negative}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-red-500" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Topics & Emotions */}
          <div className="grid lg:grid-cols-2 gap-6">
            {stats.topEmotions.length > 0 && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg"><Heart className="h-5 w-5 text-primary" /> En Sık Duygularım</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats.topEmotions.slice(0, 6).map((emotion, index) => {
                      const colorClass = getEmotionColor(emotion.emotion);
                      return (
                        <div key={emotion.emotion} className="flex items-center gap-3">
                          <span className="w-24 text-sm font-medium capitalize">{emotion.emotion}</span>
                          <div className="flex-1"><AnimatedProgress value={(emotion.count / stats.totalFeedbacks) * 100} color="bg-primary" delay={0.35 + index * 0.05} /></div>
                          <span className="text-xs text-muted-foreground">{emotion.count}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {stats.topTopics.length > 0 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-blue-500" /> En Çok Bahsettiğim Konular</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats.topTopics.slice(0, 6).map((topic, index) => {
                      const maxCount = stats.topTopics[0]?.count || 1;
                      return (
                        <div key={topic.topic} className="flex items-center gap-3">
                          <span className="w-24 text-sm font-medium capitalize">{topic.topic}</span>
                          <div className="flex-1"><AnimatedProgress value={(topic.count / maxCount) * 100} color="bg-blue-500" delay={0.35 + index * 0.05} /></div>
                          <span className="text-xs text-muted-foreground">{topic.count}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Feedback List */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" /> Geri Bildirimlerimin AI Analizi
                </CardTitle>
                <CardDescription>Her geri bildiriminizin derin AI analizi</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {stats.feedbacks.slice(0, aiAnalysisLimit).map((fb, index) => {
                  const sentimentConfig = getSentimentConfig(fb.sentiment);
                  const SentimentIcon = sentimentConfig.icon;
                  const isSelected = selectedFeedback?.id === fb.id;

                  return (
                    <motion.div key={fb.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 + index * 0.05 }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-primary/5 border-primary/30' : 'bg-card hover:border-primary/20'}`}
                      onClick={() => setSelectedFeedback(isSelected ? null : fb)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{fb.text}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{fb.qrCodeName}</Badge>
                            <Badge className={`text-xs border-0 ${sentimentConfig.bg} ${sentimentConfig.color}`}>
                              <SentimentIcon className="h-3 w-3 mr-1" />{sentimentConfig.label}
                            </Badge>
                            {fb.intent && <Badge className={`text-xs border-0 ${getIntentLabel(fb.intent).color}`}>{getIntentLabel(fb.intent).label}</Badge>}
                            {fb.urgency !== null && fb.urgency > 0.5 && <Badge className="text-xs bg-red-500/10 text-red-500 border-0">Acil</Badge>}
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
                          {fb.summary && (
                            <div className="p-3 rounded-lg bg-primary/5">
                              <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Özet</p>
                              <p className="text-sm text-muted-foreground">{fb.summary}</p>
                            </div>
                          )}

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
                {stats.feedbacks.length > aiAnalysisLimit && (
                  <div className="pt-2 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        setAiAnalysisLimit((n) =>
                          Math.min(n + 5, stats.feedbacks.length)
                        )
                      }
                    >
                      Daha fazla yükle ({stats.feedbacks.length - aiAnalysisLimit} kaldı)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
