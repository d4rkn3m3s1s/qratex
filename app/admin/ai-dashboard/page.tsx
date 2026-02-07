'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Target,
  Star,
  CheckCircle2,
  Shield,
  Activity,
  Users,
  ThumbsUp,
  ThumbsDown,
  Send,
  Bot,
  User,
  Loader2,
  BarChart3,
  Hash,
  Minus,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  Store,
  Zap,
  Eye,
  Clock,
  Database,
  Server,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// ── Types ──
interface SystemAIStats {
  totalFeedbacks: number;
  analyzedFeedbacks: number;
  avgRating: number;
  sentimentDistribution: { positive: number; negative: number; neutral: number };
  topTopics: { topic: string; count: number }[];
  topDealers: { id: string; name: string; feedbackCount: number; avgRating: number; sentiment: string }[];
  urgentFeedbacks: number;
  toxicFeedbacks: number;
  highChurnRisk: number;
  aiUsageStats: { totalCalls: number; avgLatency: number; successRate: number; model: string };
  recentAnalyses: { feedbackId: string; text: string; sentiment: string; intent: string; urgency: number; dealerName: string; createdAt: string }[];
  intentDistribution: { complaint: number; suggestion: number; praise: number; question: number; general: number };
  themeClusters: { theme: string; subTheme?: string; sentiment: string; count: number; avgScore: number }[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ── Animated Progress Bar ──
const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(value, 100)}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }}
      className={`h-full rounded-full ${color}`}
    />
  </div>
);

export default function AdminAIDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<SystemAIStats | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchStats = async () => {
    try {
      // Fetch system-wide AI stats
      const [insightsRes, usageRes] = await Promise.all([
        fetch('/api/ai/analyze?action=insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'monthly' }),
        }),
        fetch('/api/ai/analyze?action=usage_stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      ]);

      const insightsData = await insightsRes.json();
      const usageData = await usageRes.json();

      // Fetch all dealers stats
      const dealersRes = await fetch('/api/admin/dealers-ai-stats');
      let dealersData: {
        dealers: { id: string; name: string; feedbackCount: number; avgRating: number; sentiment: string }[];
        urgentCount: number;
        toxicCount: number;
        churnCount: number;
        analyzedCount: number;
        intentDist: { complaint: number; suggestion: number; praise: number; question: number; general: number };
        themeClusters: { theme: string; subTheme?: string; sentiment: string; count: number; avgScore: number }[];
        recentAnalyses: { feedbackId: string; text: string; sentiment: string; intent: string; urgency: number; dealerName: string; createdAt: string }[];
      } = { dealers: [], urgentCount: 0, toxicCount: 0, churnCount: 0, analyzedCount: 0, intentDist: { complaint: 0, suggestion: 0, praise: 0, question: 0, general: 0 }, themeClusters: [], recentAnalyses: [] };
      if (dealersRes.ok) {
        dealersData = await dealersRes.json();
      }

      const report = insightsData.report;
      const usageLogs = usageData.recentLogs || [];

      // Calculate AI usage stats
      const totalCalls = usageLogs.length;
      const successCalls = usageLogs.filter((l: { success: boolean }) => l.success).length;
      const avgLatency = totalCalls > 0
        ? usageLogs.reduce((acc: number, l: { latencyMs: number }) => acc + (l.latencyMs || 0), 0) / totalCalls
        : 0;

      setStats({
        totalFeedbacks: insightsData.stats?.totalCount || 0,
        analyzedFeedbacks: dealersData.analyzedCount || insightsData.stats?.totalCount || 0,
        avgRating: insightsData.stats?.averageRating || 0,
        sentimentDistribution: insightsData.stats?.sentimentDistribution || { positive: 0, negative: 0, neutral: 0 },
        topTopics: insightsData.stats?.topTopics || [],
        topDealers: dealersData.dealers || [],
        urgentFeedbacks: dealersData.urgentCount || 0,
        toxicFeedbacks: dealersData.toxicCount || 0,
        highChurnRisk: dealersData.churnCount || 0,
        aiUsageStats: {
          totalCalls,
          avgLatency: Math.round(avgLatency),
          successRate: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 100,
          model: usageLogs[0]?.model || 'N/A',
        },
        recentAnalyses: dealersData.recentAnalyses || [],
        intentDistribution: dealersData.intentDist || { complaint: 0, suggestion: 0, praise: 0, question: 0, general: 0 },
        themeClusters: insightsData.themeClusters || dealersData.themeClusters || [],
      });
    } catch (error) {
      console.error('Failed to fetch admin AI stats:', error);
      toast.error('AI istatistikleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    toast.success('AI istatistikleri güncellendi!');
  };

  const sendMessageWithText = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const message = text.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: message, timestamp: new Date().toISOString() }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/analyze?action=ask', {
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

  const sendMessage = () => sendMessageWithText(chatInput);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">Sistem AI istatistikleri yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-4 sm:p-6 md:p-8"
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
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm font-medium">Sistem Yönetimi</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Brain className="w-8 h-8" /> AI Kontrol Merkezi
            </h1>
            <p className="text-white/70 mt-1">Tüm sistem genelinde AI analiz istatistikleri ve yönetimi</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">Toplam Analiz</span>
              <p className="text-lg sm:text-2xl font-bold">{stats?.analyzedFeedbacks || 0}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">AI Başarı</span>
              <p className="text-2xl font-bold">{stats?.aiUsageStats.successRate || 100}%</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={handleRefresh} disabled={refreshing} className="bg-white text-purple-600 hover:bg-white/90">
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Yenile
              </Button>
              <Button onClick={() => setChatOpen(!chatOpen)} variant="outline" className="border-white/30 text-white hover:bg-white/10">
                <MessageSquare className="h-4 w-4 mr-2" />
                AI&apos;a Sor
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bot className="h-5 w-5 text-violet-500" /> AI Asistanı (Admin)
                </CardTitle>
                <CardDescription>Tüm sistem verilerini doğal dilde sorgulayın</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto space-y-3 mb-4 p-3 rounded-xl bg-muted/30">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">Sistem genelinde AI analiz verilerini sorgulayabilirsiniz.</p>
                      <div className="flex flex-wrap gap-2 justify-center mt-4">
                        {['En çok şikayet alan dealer kim?', 'Sistem genelinde memnuniyet trendi nasıl?', 'Hangi konularda acil aksiyon gerekiyor?', 'Churn riski yüksek müşteriler hangi dealer\'da?'].map(q => (
                          <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => sendMessageWithText(q)}>
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
                        <div className="p-2 rounded-lg bg-violet-500/10 h-fit"><Bot className="h-4 w-4 text-violet-500" /></div>
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
                      <div className="p-2 rounded-lg bg-violet-500/10 h-fit"><Bot className="h-4 w-4 text-violet-500" /></div>
                      <div className="bg-card border p-3 rounded-xl">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2">
                  <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()} placeholder="Sistem hakkında sorunuzu yazın..." disabled={chatLoading} className="flex-1" />
                  <Button onClick={sendMessage} disabled={chatLoading || !chatInput.trim()} size="icon"><Send className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Critical Alerts */}
      {stats && (stats.urgentFeedbacks > 0 || stats.toxicFeedbacks > 0 || stats.highChurnRisk > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.urgentFeedbacks > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-0 bg-red-500/5 border-red-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-red-500/10"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{stats.urgentFeedbacks}</p>
                    <p className="text-sm text-muted-foreground">Acil Geri Bildirim</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {stats.toxicFeedbacks > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="border-0 bg-orange-500/5 border-orange-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-orange-500/10"><Shield className="h-6 w-6 text-orange-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-orange-500">{stats.toxicFeedbacks}</p>
                    <p className="text-sm text-muted-foreground">Toksik İçerik</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {stats.highChurnRisk > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-0 bg-pink-500/5 border-pink-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-pink-500/10"><Users className="h-6 w-6 text-pink-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-pink-500">{stats.highChurnRisk}</p>
                    <p className="text-sm text-muted-foreground">Yüksek Churn Riski</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {/* System Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {[
          { label: 'Toplam Feedback', value: stats?.totalFeedbacks || 0, icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'AI Analiz Edilmiş', value: stats?.analyzedFeedbacks || 0, icon: Brain, color: 'text-violet-500', bg: 'bg-violet-500/10' },
          { label: 'Ort. Puan', value: `${(stats?.avgRating || 0).toFixed(1)}/5`, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { label: 'AI Model', value: stats?.aiUsageStats.model?.split('/').pop() || 'N/A', icon: Cpu, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Card className="border-0 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <div className={`p-2 rounded-lg ${item.bg} w-fit mx-auto mb-2`}>
                    <Icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* AI Performance & Sentiment */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* AI Performance */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-violet-500" /> AI Performans
              </CardTitle>
              <CardDescription>AI motorunun sistem performansı</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-xl bg-muted/30">
                  <p className="text-2xl font-bold text-violet-500">{stats?.aiUsageStats.totalCalls || 0}</p>
                  <p className="text-xs text-muted-foreground">Toplam Çağrı</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-muted/30">
                  <p className="text-2xl font-bold text-emerald-500">{stats?.aiUsageStats.successRate || 100}%</p>
                  <p className="text-xs text-muted-foreground">Başarı Oranı</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-muted/30">
                  <p className="text-2xl font-bold text-blue-500">{stats?.aiUsageStats.avgLatency || 0}ms</p>
                  <p className="text-xs text-muted-foreground">Ort. Yanıt</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Başarı Oranı</p>
                <AnimatedProgress value={stats?.aiUsageStats.successRate || 100} color="bg-emerald-500" delay={0.3} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sentiment Distribution */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-violet-500" /> Sistem Duygu Dağılımı
              </CardTitle>
              <CardDescription>Tüm geri bildirimlerin duygu analizi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
                <div className="text-center p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <ThumbsUp className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
                  <p className="text-xl sm:text-3xl font-bold text-emerald-500">{stats?.sentimentDistribution.positive || 0}%</p>
                  <p className="text-sm text-muted-foreground">Olumlu</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <Minus className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                  <p className="text-xl sm:text-3xl font-bold text-blue-500">{stats?.sentimentDistribution.neutral || 0}%</p>
                  <p className="text-sm text-muted-foreground">Nötr</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <ThumbsDown className="h-6 w-6 mx-auto text-red-500 mb-2" />
                  <p className="text-xl sm:text-3xl font-bold text-red-500">{stats?.sentimentDistribution.negative || 0}%</p>
                  <p className="text-sm text-muted-foreground">Olumsuz</p>
                </div>
              </div>
              <div className="h-4 rounded-full overflow-hidden flex">
                <motion.div initial={{ width: 0 }} animate={{ width: `${stats?.sentimentDistribution.positive || 0}%` }} transition={{ duration: 1 }} className="bg-emerald-500" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${stats?.sentimentDistribution.neutral || 0}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-blue-400" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${stats?.sentimentDistribution.negative || 0}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-red-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Intent Distribution */}
      {stats?.intentDistribution && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-orange-500" /> Niyet Dağılımı (Intent)
              </CardTitle>
              <CardDescription>Geri bildirimlerin amaç bazlı dağılımı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Şikâyet', value: stats.intentDistribution.complaint, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
                  { label: 'Öneri', value: stats.intentDistribution.suggestion, icon: Lightbulb, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                  { label: 'Övgü', value: stats.intentDistribution.praise, icon: ThumbsUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                  { label: 'Soru', value: stats.intentDistribution.question, icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                  { label: 'Genel', value: stats.intentDistribution.general, icon: FileText, color: 'text-gray-500', bg: 'bg-gray-500/10' },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + index * 0.05 }}>
                      <div className="text-center p-4 rounded-xl bg-card border">
                        <div className={`p-2 rounded-lg ${item.bg} w-fit mx-auto mb-2`}>
                          <Icon className={`h-5 w-5 ${item.color}`} />
                        </div>
                        <p className="text-2xl font-bold">{item.value}</p>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Top Topics */}
      {stats?.topTopics && stats.topTopics.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" /> Sistem Geneli En Çok Bahsedilen Konular
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topTopics.slice(0, 10).map((topic, index) => {
                  const maxCount = stats.topTopics[0]?.count || 1;
                  const percentage = (topic.count / maxCount) * 100;
                  return (
                    <motion.div key={topic.topic} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + index * 0.05 }} className="flex items-center gap-3">
                      <span className="w-24 text-sm font-medium capitalize">{topic.topic}</span>
                      <div className="flex-1"><AnimatedProgress value={percentage} color="bg-blue-500" delay={0.5 + index * 0.05} /></div>
                      <span className="text-sm text-muted-foreground w-12 text-right">{topic.count}</span>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Theme Clusters */}
      {stats?.themeClusters && stats.themeClusters.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" /> Tema Kümeleri (Tüm Sistem)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.themeClusters.slice(0, 9).map((cluster, index) => (
                  <motion.div key={`${cluster.theme}-${cluster.subTheme}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + index * 0.05 }} className="p-4 rounded-xl border bg-card">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold">{cluster.theme}</h4>
                        {cluster.subTheme && <p className="text-xs text-muted-foreground">{cluster.subTheme}</p>}
                      </div>
                      <Badge className={`border ${cluster.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : cluster.sentiment === 'negative' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-blue-500/10 text-blue-500 border-blue-500/30'}`}>
                        {cluster.sentiment === 'positive' ? 'Olumlu' : cluster.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{cluster.count}</span>
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{(cluster.avgScore * 5).toFixed(1)}/5</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Top Dealers */}
      {stats?.topDealers && stats.topDealers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-violet-500" /> Dealer AI Performansı
              </CardTitle>
              <CardDescription>İşletmelerin AI analiz sonuçlarına göre sıralaması</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topDealers.map((dealer, index) => (
                  <motion.div key={dealer.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.65 + index * 0.05 }} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{dealer.name}</p>
                        <p className="text-xs text-muted-foreground">{dealer.feedbackCount} geri bildirim</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-bold">{dealer.avgRating.toFixed(1)}/5</p>
                        <Badge className={`text-xs ${dealer.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-500' : dealer.sentiment === 'negative' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'} border-0`}>
                          {dealer.sentiment === 'positive' ? 'Olumlu' : dealer.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent AI Analyses */}
      {stats?.recentAnalyses && stats.recentAnalyses.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" /> Son AI Analizleri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.recentAnalyses.slice(0, 10).map((analysis, index) => (
                  <motion.div key={analysis.feedbackId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 + index * 0.03 }} className="p-3 rounded-xl border bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{analysis.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{analysis.dealerName}</Badge>
                          <Badge className={`text-xs border-0 ${analysis.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-500' : analysis.sentiment === 'negative' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {analysis.sentiment}
                          </Badge>
                          {analysis.intent && <Badge className="text-xs bg-orange-500/10 text-orange-500 border-0">{analysis.intent}</Badge>}
                          {analysis.urgency > 0.7 && <Badge className="text-xs bg-red-500/10 text-red-500 border-0">⚠️ Acil</Badge>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(analysis.createdAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
