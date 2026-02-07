'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Zap,
  Target,
  Star,
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  Rocket,
  Award,
  Activity,
  Eye,
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
  Search,
  Filter,
  Database,
  Flame,
  Cpu,
  ListChecks,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// ── Types ──
interface InsightReport {
  overallScore: number;
  trend: string;
  trendValue: number;
  totalFeedbacks: number;
  summary: string;
  strengths: { title: string; score: number; description: string }[];
  weaknesses: { title: string; score: number; description: string }[];
  recommendations: { text: string; priority: string; impact: string; category: string }[];
  alerts: { type: string; message: string; severity: string }[];
  keyDrivers: { factor: string; impact: number; correlation: number; direction: string }[];
  predictedRating: number;
  keyMetrics: { responseRate: number; avgRating: number; nps: number; csat: number; ces: number };
}

interface ThemeCluster {
  theme: string;
  subTheme?: string;
  sentiment: string;
  count: number;
  avgScore: number;
  keywords?: string[];
  sampleTexts?: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface FeedbackEntity {
  type: string;
  name: string;
  sentiment: string;
}

interface FeedbackTheme {
  theme: string;
  subTheme?: string;
  sentiment: string;
  score: number;
}

interface StatementSentiment {
  statement: string;
  sentiment: string;
  score: number;
}

interface ActionSuggestion {
  action: string;
  priority: string;
  impact: string;
  category: string;
}

interface DetailedFeedback {
  id: string;
  rating: number;
  text: string;
  createdAt: string;
  sentiment: string | null;
  emotions: string[];
  topics: string[];
  isToxic: boolean | null;
  intent: string | null;
  intentScore: number | null;
  urgency: number | null;
  effortScore: number | null;
  churnRisk: number | null;
  entities: FeedbackEntity[];
  themes: FeedbackTheme[];
  statementSentiments: StatementSentiment[];
  actionSuggestions: ActionSuggestion[];
  aiModelUsed: string | null;
  aiVersion: string | null;
  aiProcessedAt: string | null;
  user?: { name: string | null };
}

interface DetailedSignals {
  intentDist: Record<string, number>;
  urgencyBuckets: { low: number; medium: number; high: number; critical: number };
  churnBuckets: { safe: number; low: number; medium: number; high: number };
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

interface LearningStatus {
  profile: {
    version: number;
    status: string;
    lastTrainedAt: string | null;
    trainingFeedbackCount: number;
    correctionsUsed: number;
  } | null;
  embeddingsCount: number;
  correctionsCount: number;
}

interface CorrectionItem {
  id: string;
  feedbackId: string;
  field: string;
  newValue: unknown;
  oldValue: unknown;
  note: string | null;
  createdAt: string;
  feedback?: { text: string | null };
}

// ── Circular Progress Component ──
const CircularProgress = ({ 
  value, 
  size = 140, 
  strokeWidth = 12,
}: { 
  value: number; 
  size?: number; 
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  const getColor = (score: number) => {
    if (score >= 80) return 'stroke-emerald-500';
    if (score >= 60) return 'stroke-green-500';
    if (score >= 40) return 'stroke-yellow-500';
    if (score >= 20) return 'stroke-orange-500';
    return 'stroke-red-500';
  };
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          className={getColor(value)}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring' }} className="text-4xl font-bold">
          {value}
        </motion.span>
        <span className="text-sm text-muted-foreground">Puan</span>
      </div>
    </div>
  );
};

// ── Animated Progress Bar ──
const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${value}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }}
      className={`h-full rounded-full ${color}`}
    />
  </div>
);

export default function DealerAIInsightsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<InsightReport | null>(null);
  const [themeClusters, setThemeClusters] = useState<ThemeCluster[]>([]);
  const [stats, setStats] = useState<{ totalCount: number; averageRating: number; sentimentDistribution: { positive: number; negative: number; neutral: number }; topTopics: { topic: string; count: number }[] } | null>(null);
  const [detailedFeedbacks, setDetailedFeedbacks] = useState<DetailedFeedback[]>([]);
  const [signals, setSignals] = useState<DetailedSignals | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'negative' | 'neutral' | 'mixed'>('all');
  const [showAllFeedbacks, setShowAllFeedbacks] = useState(false);
  
  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Theme clusters expand
  const [showAllClusters, setShowAllClusters] = useState(false);

  // Learning state
  const [learningStatus, setLearningStatus] = useState<LearningStatus | null>(null);
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [learningUpdating, setLearningUpdating] = useState(false);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    feedbackId: '',
    field: 'sentiment',
    newValue: '',
    oldValue: '',
    note: '',
  });
  const correctionRef = useRef<HTMLDivElement>(null);

  // Bulk analyze state
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, running: false });

  useEffect(() => {
    fetchInsights();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchInsights = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const [insightsRes, detailedRes, learningRes] = await Promise.all([
        fetch('/api/ai/analyze?action=insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'monthly' }),
        }),
        fetch('/api/ai/detailed?limit=50'),
        fetch('/api/ai/learning'),
      ]);

      const insightsData = await insightsRes.json();
      if (insightsData.success) {
        if (insightsData.report) setReport(insightsData.report);
        if (insightsData.themeClusters) setThemeClusters(insightsData.themeClusters);
        if (insightsData.stats) setStats(insightsData.stats);
      }

      const detailedData = await detailedRes.json();
      if (detailedData.success) {
        const normalizedFeedbacks = (Array.isArray(detailedData.feedbacks) ? detailedData.feedbacks : []).map((fb: DetailedFeedback) => ({
          ...fb,
          emotions: Array.isArray(fb.emotions) ? fb.emotions : [],
          topics: Array.isArray(fb.topics) ? fb.topics : [],
          entities: Array.isArray(fb.entities) ? fb.entities : [],
          themes: Array.isArray(fb.themes) ? fb.themes : [],
          statementSentiments: Array.isArray(fb.statementSentiments) ? fb.statementSentiments : [],
          actionSuggestions: Array.isArray(fb.actionSuggestions) ? fb.actionSuggestions : [],
        }));
        setDetailedFeedbacks(normalizedFeedbacks);
        if (detailedData.signals) setSignals(detailedData.signals);
      }

      const learningData = await learningRes.json();
      if (learningData.success) {
        setLearningStatus({
          profile: learningData.profile || null,
          embeddingsCount: learningData.embeddingsCount ?? 0,
          correctionsCount: learningData.correctionsCount ?? 0,
        });
        setCorrections(Array.isArray(learningData.corrections) ? learningData.corrections : []);
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
      toast.error('İçgörüler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInsights(true);
    setRefreshing(false);
      toast.success('AI içgörüleri güncellendi!');
  };

  const stringifyValue = (value: unknown) => {
    if (value == null) return '-';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const parseMaybeJson = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  };

  const handleUpdateLearningProfile = async () => {
    setLearningUpdating(true);
    try {
      const res = await fetch('/api/ai/learning?action=update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Öğrenme profili güncellendi');
        setLearningStatus(prev => (prev ? { ...prev, profile: data.profile || prev.profile } : prev));
      } else {
        toast.error(data.error || 'Profil güncelleme başarısız');
      }
    } catch (error) {
      console.error('Learning update failed:', error);
      toast.error('Profil güncellenemedi');
    } finally {
      setLearningUpdating(false);
    }
  };

  const handleSubmitCorrection = async () => {
    if (!correctionForm.feedbackId.trim()) {
      toast.error('Feedback ID gerekli');
      return;
    }
    if (!correctionForm.field.trim()) {
      toast.error('Alan adı gerekli');
      return;
    }

    const newValue = parseMaybeJson(correctionForm.newValue);
    if (newValue === undefined) {
      toast.error('Yeni değer gerekli');
      return;
    }

    const oldValue = parseMaybeJson(correctionForm.oldValue);

    setCorrectionSubmitting(true);
    try {
      const res = await fetch('/api/ai/learning?action=record_correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackId: correctionForm.feedbackId.trim(),
          field: correctionForm.field.trim(),
          newValue,
          ...(oldValue !== undefined ? { oldValue } : {}),
          note: correctionForm.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Düzeltme kaydedildi');
        setCorrectionForm(prev => ({ ...prev, newValue: '', oldValue: '', note: '' }));
        const statusRes = await fetch('/api/ai/learning');
        const statusData = await statusRes.json();
        if (statusData.success) {
          setLearningStatus({
            profile: statusData.profile || null,
            embeddingsCount: statusData.embeddingsCount ?? 0,
            correctionsCount: statusData.correctionsCount ?? 0,
          });
          setCorrections(Array.isArray(statusData.corrections) ? statusData.corrections : []);
        }
      } else {
        toast.error(data.error || 'Düzeltme kaydedilemedi');
      }
    } catch (error) {
      console.error('Correction submit failed:', error);
      toast.error('Düzeltme kaydedilemedi');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const handleBulkAnalyze = async () => {
    if (bulkAnalyzing) return;
    setBulkAnalyzing(true);
    setBulkProgress({ done: 0, total: 0, running: true });
    toast.info('Toplu AI analizi başlatılıyor...');

    try {
      // Analiz edilmemiş feedbackları bul
      const unanalyzedIds = detailedFeedbacks
        .filter(fb => !fb.intent && fb.text)
        .map(fb => fb.id);

      if (unanalyzedIds.length === 0) {
        toast.info('Tüm feedbacklar zaten analiz edilmiş!');
        setBulkAnalyzing(false);
        setBulkProgress({ done: 0, total: 0, running: false });
        return;
      }

      const batchSize = 5;
      const totalBatches = Math.ceil(unanalyzedIds.length / batchSize);
      setBulkProgress({ done: 0, total: unanalyzedIds.length, running: true });

      for (let i = 0; i < totalBatches; i++) {
        const batch = unanalyzedIds.slice(i * batchSize, (i + 1) * batchSize);
        try {
          const res = await fetch('/api/ai/analyze?action=bulk_analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedbackIds: batch }),
          });
          const data = await res.json();
          const analyzed = data.analyzed || 0;
          setBulkProgress(prev => ({ ...prev, done: prev.done + analyzed }));
        } catch (err) {
          console.error(`Batch ${i + 1} failed:`, err);
        }
        // Rate limit koruması
        if (i < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      toast.success('Toplu analiz tamamlandı! Sayfa yenileniyor...');
      setBulkProgress(prev => ({ ...prev, running: false }));

      // Profili güncelle
      try {
        await fetch('/api/ai/learning?action=update_profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch {}

      // Sayfayı yenile
      await fetchInsights(true);
    } catch (error) {
      console.error('Bulk analyze failed:', error);
      toast.error('Toplu analiz başarısız oldu');
    } finally {
      setBulkAnalyzing(false);
      setBulkProgress(prev => ({ ...prev, running: false }));
    }
  };

  const selectFeedbackForCorrection = (feedbackId: string, preview?: string) => {
    setCorrectionForm(prev => ({
      ...prev,
      feedbackId,
      note: prev.note || (preview ? `Hızlı seçim: ${preview.slice(0, 120)}` : prev.note),
    }));
    correctionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Bir hata oluştu. Lütfen tekrar deneyin.', timestamp: new Date().toISOString() }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Bağlantı hatası. Lütfen tekrar deneyin.', timestamp: new Date().toISOString() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const sendMessage = async () => {
    await sendMessageWithText(chatInput);
  };

  const sendQuickMessage = async (question: string) => {
    await sendMessageWithText(question);
  };

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'high': case 'critical':
        return { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', label: priority === 'critical' ? 'Kritik' : 'Yüksek', gradient: 'from-red-500 to-rose-600' };
      case 'medium':
        return { color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Orta', gradient: 'from-yellow-500 to-orange-500' };
      default:
        return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Düşük', gradient: 'from-emerald-500 to-teal-600' };
    }
  };

  const getAlertConfig = (severity: string) => {
    switch (severity) {
      case 'error': case 'critical':
        return { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' };
      case 'warning':
        return { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
      case 'info':
        return { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' };
      default:
        return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'negative': return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'mixed': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'staff': case 'staff_training': return Users;
      case 'process': return Activity;
      case 'product': return Star;
      case 'facility': return Eye;
      case 'marketing': return Target;
      case 'pricing': return BarChart3;
      default: return Lightbulb;
    }
  };

  const getSentimentConfig = (sentiment?: string | null) => {
    switch ((sentiment || 'neutral').toLowerCase()) {
      case 'positive':
        return { label: 'Olumlu', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: ThumbsUp };
      case 'negative':
        return { label: 'Olumsuz', color: 'text-red-500', bg: 'bg-red-500/10', icon: ThumbsDown };
      case 'mixed':
        return { label: 'Karışık', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: AlertTriangle };
      default:
        return { label: 'Nötr', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Minus };
    }
  };

  const getIntentLabel = (intent?: string | null) => {
    switch ((intent || '').toLowerCase()) {
      case 'complaint':
        return { label: 'Şikayet', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
      case 'suggestion':
        return { label: 'Öneri', color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
      case 'praise':
        return { label: 'Övgü', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
      case 'question':
        return { label: 'Soru', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
      default:
        return { label: 'Genel', color: 'bg-muted text-muted-foreground border-muted' };
    }
  };

  const getUrgencyLabel = (value: number | null) => {
    if (value == null) return null;
    if (value < 0.3) return { label: 'Düşük', color: 'text-emerald-500' };
    if (value < 0.5) return { label: 'Orta', color: 'text-yellow-500' };
    if (value < 0.7) return { label: 'Yüksek', color: 'text-orange-500' };
    return { label: 'Kritik', color: 'text-red-500' };
  };

  const getChurnLabel = (value: number | null) => {
    if (value == null) return null;
    if (value < 0.25) return { label: 'Güvenli', color: 'text-emerald-500' };
    if (value < 0.5) return { label: 'Düşük', color: 'text-yellow-500' };
    if (value < 0.75) return { label: 'Orta', color: 'text-orange-500' };
    return { label: 'Yüksek', color: 'text-red-500' };
  };

  const sumRecord = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
  const toPercent = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;

  const filteredFeedbacks = useMemo(() => {
    return detailedFeedbacks.filter(fb => {
      const sentimentValue = (fb.sentiment || 'neutral').toLowerCase();
      const matchesSentiment = sentimentFilter === 'all' || sentimentValue === sentimentFilter;
      const matchesSearch = !searchQuery.trim()
        || fb.text.toLowerCase().includes(searchQuery.trim().toLowerCase())
        || (fb.user?.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesSentiment && matchesSearch;
    });
  }, [detailedFeedbacks, sentimentFilter, searchQuery]);

  const visibleFeedbacks = showAllFeedbacks ? filteredFeedbacks : filteredFeedbacks.slice(0, 10);

  const latestProcessedAt = useMemo(() => {
    let latest: string | null = null;
    detailedFeedbacks.forEach(fb => {
      if (!fb.aiProcessedAt) return;
      if (!latest || new Date(fb.aiProcessedAt).getTime() > new Date(latest).getTime()) {
        latest = fb.aiProcessedAt;
      }
    });
    return latest;
  }, [detailedFeedbacks]);

  const analyzedRate = signals ? toPercent(signals.totalAnalyzed, signals.totalFeedbacks) : 0;

  const intentItems = [
    { key: 'complaint', label: 'Şikayet', color: 'bg-red-500' },
    { key: 'suggestion', label: 'Öneri', color: 'bg-violet-500' },
    { key: 'praise', label: 'Övgü', color: 'bg-emerald-500' },
    { key: 'question', label: 'Soru', color: 'bg-blue-500' },
    { key: 'general', label: 'Genel', color: 'bg-slate-500' },
  ];

  const urgencyItems = [
    { key: 'low', label: 'Düşük', color: 'bg-emerald-500' },
    { key: 'medium', label: 'Orta', color: 'bg-yellow-500' },
    { key: 'high', label: 'Yüksek', color: 'bg-orange-500' },
    { key: 'critical', label: 'Kritik', color: 'bg-red-500' },
  ];

  const churnItems = [
    { key: 'safe', label: 'Güvenli', color: 'bg-emerald-500' },
    { key: 'low', label: 'Düşük', color: 'bg-yellow-500' },
    { key: 'medium', label: 'Orta', color: 'bg-orange-500' },
    { key: 'high', label: 'Yüksek', color: 'bg-red-500' },
  ];

  if (loading) {
  return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">AI içgörüleri yükleniyor...</p>
      </div>
    );
  }

  // No data state
  if (!report && !stats && detailedFeedbacks.length === 0 && !signals) {
    return (
      <div className="space-y-6 pb-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
        >
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Sparkles className="w-8 h-8" /> AI İçgörüler
            </h1>
            <p className="text-white/70 mt-1">Henüz yeterli geri bildirim verisi yok</p>
          </div>
        </motion.div>
        <Card className="border-0 bg-card/50">
          <CardContent className="p-12 text-center">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-xl font-bold mb-2">Veri Bekleniyor</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              AI içgörüleri oluşturabilmek için en az 3 geri bildirim gereklidir. QR kodlarınızı paylaşarak geri bildirim toplamaya başlayın.
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
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-primary/10 dark:bg-black/20 rounded-full blur-3xl" />
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/40 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [0, -20, 0], opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 mb-2">
                <Brain className="w-6 h-6 text-white/80" />
                <span className="text-white/80 text-sm font-medium">Yapay Zeka Destekli</span>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3"
              >
                <Sparkles className="w-8 h-8" /> AI İçgörüler
              </motion.h1>
              <motion.p initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="text-white/70 mt-1">
                İşletmeniz için akıllı analiz ve kişiselleştirilmiş öneriler
              </motion.p>
            </div>
            
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-4">
              {report && (
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-4">
                  <CircularProgress value={report.overallScore} size={100} strokeWidth={10} />
                <div className="text-white">
                  <p className="text-white/60 text-sm">Genel Skor</p>
                  <div className="flex items-center gap-2">
                      {report.trend === 'up' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : report.trend === 'down' ? <TrendingDown className="w-5 h-5 text-red-400" /> : <Minus className="w-5 h-5 text-white/60" />}
                      <span className={`font-semibold ${report.trend === 'up' ? 'text-emerald-400' : report.trend === 'down' ? 'text-red-400' : 'text-white/60'}`}>
                        {report.trend === 'up' ? '+' : ''}{report.trendValue.toFixed(1)} bu dönem
                    </span>
                  </div>
                    <p className="text-white/50 text-xs mt-1">{report.totalFeedbacks} geri bildirim analiz edildi</p>
                </div>
              </div>
              )}
              <div className="flex flex-col gap-2">
                <Button onClick={handleRefresh} disabled={refreshing} className="bg-white text-purple-600 hover:bg-white/90">
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Yenileniyor...' : 'Yenile'}
                </Button>
                <Button onClick={() => setChatOpen(!chatOpen)} variant="outline" className="border-white/30 text-white hover:bg-white/10">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  AI&apos;a Sor
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bot className="h-5 w-5 text-violet-500" />
                  AI Asistanı
                </CardTitle>
                <CardDescription>
                  Geri bildirim verileriniz hakkında doğal dilde sorular sorun
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Chat Messages */}
                <div className="max-h-[400px] overflow-y-auto space-y-3 mb-4 p-3 rounded-xl bg-muted/30">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">Merhaba! Geri bildirimleriniz hakkında soru sorabilirsiniz.</p>
                      <div className="flex flex-wrap gap-2 justify-center mt-4">
                        {['En çok şikayet edilen konu ne?', 'Genel memnuniyet durumum nasıl?', 'Son hafta hangi konularda iyileşme var?'].map(q => (
                          <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => { sendQuickMessage(q); }}>
                            {q}
              </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="p-2 rounded-lg bg-violet-500/10 h-fit">
                          <Bot className="h-4 w-4 text-violet-500" />
                        </div>
                      )}
                      <div className={`max-w-[80%] p-3 rounded-xl text-sm whitespace-pre-wrap ${
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border'
                      }`}>
                        {msg.content}
                      </div>
                      {msg.role === 'user' && (
                        <div className="p-2 rounded-lg bg-primary/10 h-fit">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      )}
            </motion.div>
                  ))}
                  {chatLoading && (
                    <div className="flex gap-3">
                      <div className="p-2 rounded-lg bg-violet-500/10 h-fit">
                        <Bot className="h-4 w-4 text-violet-500" />
          </div>
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
                {/* Chat Input */}
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Sorunuzu yazın..."
                    disabled={chatLoading}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={chatLoading || !chatInput.trim()} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
      </motion.div>
        )}
      </AnimatePresence>

      {/* Alerts */}
      {report?.alerts && report.alerts.length > 0 && (
      <div className="space-y-2">
          {report.alerts.map((alert, index) => {
            const config = getAlertConfig(alert.severity);
          const AlertIcon = config.icon;
          return (
              <motion.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}>
              <Card className={`border-0 ${config.bg}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <AlertIcon className={`h-5 w-5 ${config.color}`} />
                    </div>
                      <div>
                    <span className="font-medium">{alert.message}</span>
                        <Badge className="ml-2 text-xs" variant="outline">{alert.type}</Badge>
                  </div>
                    </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
      )}

      {/* Key Metrics */}
      {report?.keyMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Ort. Puan', value: `${report.keyMetrics.avgRating.toFixed(1)}/5`, icon: Star, color: 'text-yellow-500' },
            { label: 'NPS', value: report.keyMetrics.nps.toString(), icon: TrendingUp, color: report.keyMetrics.nps >= 50 ? 'text-emerald-500' : report.keyMetrics.nps >= 0 ? 'text-yellow-500' : 'text-red-500' },
            { label: 'CSAT', value: `${report.keyMetrics.csat}%`, icon: ThumbsUp, color: report.keyMetrics.csat >= 70 ? 'text-emerald-500' : 'text-yellow-500' },
            { label: 'CES', value: report.keyMetrics.ces.toFixed(1), icon: Activity, color: report.keyMetrics.ces <= 3 ? 'text-emerald-500' : 'text-yellow-500' },
            { label: 'Yanıt Oranı', value: `${report.keyMetrics.responseRate}%`, icon: MessageSquare, color: 'text-blue-500' },
          ].map((metric, index) => {
            const MetricIcon = metric.icon;
            return (
              <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.05 }}>
                <Card className="border-0 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <MetricIcon className={`h-5 w-5 mx-auto mb-2 ${metric.color}`} />
                    <p className="text-2xl font-bold">{metric.value}</p>
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Sentiment Distribution */}
      {stats?.sentimentDistribution && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-violet-500" />
                Duygu Dağılımı
              </CardTitle>
            </CardHeader>
            <CardContent>
      <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <ThumbsUp className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
                  <p className="text-3xl font-bold text-emerald-500">{stats.sentimentDistribution.positive}%</p>
                  <p className="text-sm text-muted-foreground">Olumlu</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <Minus className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                  <p className="text-3xl font-bold text-blue-500">{stats.sentimentDistribution.neutral}%</p>
                  <p className="text-sm text-muted-foreground">Nötr</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <ThumbsDown className="h-6 w-6 mx-auto text-red-500 mb-2" />
                  <p className="text-3xl font-bold text-red-500">{stats.sentimentDistribution.negative}%</p>
                  <p className="text-sm text-muted-foreground">Olumsuz</p>
                </div>
              </div>
              {/* Sentiment bar */}
              <div className="mt-4 h-4 rounded-full overflow-hidden flex">
                <motion.div initial={{ width: 0 }} animate={{ width: `${stats.sentimentDistribution.positive}%` }} transition={{ duration: 1 }} className="bg-emerald-500" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${stats.sentimentDistribution.neutral}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-blue-400" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${stats.sentimentDistribution.negative}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-red-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Experience Signals */}
      {signals && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-violet-500" />
                Experience Signals
              </CardTitle>
              <CardDescription>Geri bildirimlerden çıkarılan çok katmanlı sinyaller</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">Toplam Geri Bildirim</p>
                  <p className="text-2xl font-bold">{signals.totalFeedbacks}</p>
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">AI Analiz Kapsamı</p>
                  <p className="text-2xl font-bold">{analyzedRate}%</p>
                  <AnimatedProgress value={analyzedRate} color="bg-violet-500" delay={0.1} />
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">Ort. Efor</p>
                  <p className={`text-2xl font-bold ${signals.avgEffort > 0.7 ? 'text-red-500' : signals.avgEffort > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {(signals.avgEffort * 10).toFixed(1)}/10
                  </p>
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">Ort. Aciliyet</p>
                  <p className={`text-2xl font-bold ${signals.avgUrgency > 0.7 ? 'text-red-500' : signals.avgUrgency > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {(signals.avgUrgency * 10).toFixed(1)}/10
                  </p>
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">Ort. Churn Riski</p>
                  <p className={`text-2xl font-bold ${signals.avgChurnRisk > 0.7 ? 'text-red-500' : signals.avgChurnRisk > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {(signals.avgChurnRisk * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              </CardContent>
            </Card>
          </motion.div>
      )}

      {/* Intent / Urgency / Churn Distributions */}
      {signals && (() => {
        const totalIntent = sumRecord(signals.intentDist);
        const totalUrgency = sumRecord(signals.urgencyBuckets);
        const totalChurn = sumRecord(signals.churnBuckets);
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}>
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-indigo-500" />
                  Niyet, Aciliyet ve Churn Dağılımları
                </CardTitle>
                <CardDescription>İçgörülerde öne çıkan davranış sinyalleri</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-violet-500" /> Niyet
                    </p>
                    {intentItems.map((item, index) => {
                      const value = signals.intentDist[item.key] || 0;
                      const pct = toPercent(value, totalIntent);
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-muted-foreground">{item.label}</span>
                          <div className="flex-1">
                            <AnimatedProgress value={pct} color={item.color} delay={0.1 + index * 0.05} />
      </div>
                          <span className="text-xs w-8 text-right">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" /> Aciliyet
                    </p>
                    {urgencyItems.map((item, index) => {
                      const value = signals.urgencyBuckets[item.key as keyof typeof signals.urgencyBuckets] || 0;
                      const pct = toPercent(value, totalUrgency);
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-muted-foreground">{item.label}</span>
                          <div className="flex-1">
                            <AnimatedProgress value={pct} color={item.color} delay={0.1 + index * 0.05} />
                          </div>
                          <span className="text-xs w-8 text-right">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-500" /> Churn Riski
                    </p>
                    {churnItems.map((item, index) => {
                      const value = signals.churnBuckets[item.key as keyof typeof signals.churnBuckets] || 0;
                      const pct = toPercent(value, totalChurn);
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-muted-foreground">{item.label}</span>
                          <div className="flex-1">
                            <AnimatedProgress value={pct} color={item.color} delay={0.1 + index * 0.05} />
                          </div>
                          <span className="text-xs w-8 text-right">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })()}

      {/* Summary */}
      {report?.summary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="border-0 bg-gradient-to-r from-violet-500/5 via-purple-500/5 to-fuchsia-500/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shrink-0">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    AI Özet
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{report.summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Strengths & Weaknesses */}
      {report && (
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Strengths */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-500">
                  <ThumbsUp className="h-5 w-5" /> Güçlü Yönler
              </CardTitle>
              <CardDescription>Müşterilerinizin en çok beğendiği özellikler</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {report.strengths.map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{item.title}</span>
                          <span className="text-emerald-500 font-bold">{item.score}/100</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                        <AnimatedProgress value={item.score} color="bg-emerald-500" delay={0.6 + index * 0.1} />
                      </div>
                    </div>
                  </motion.div>
                ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Weaknesses */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                  <ThumbsDown className="h-5 w-5" /> İyileştirme Alanları
              </CardTitle>
              <CardDescription>Geliştirilmesi gereken noktalar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {report.weaknesses.map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-yellow-500/10">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{item.title}</span>
                          <span className="text-yellow-500 font-bold">{item.score}/100</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                        <AnimatedProgress value={item.score} color="bg-yellow-500" delay={0.6 + index * 0.1} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Key Drivers */}
      {report?.keyDrivers && report.keyDrivers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-violet-500" />
                Anahtar Faktörler
              </CardTitle>
              <CardDescription>Memnuniyeti en çok etkileyen faktörler</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {report.keyDrivers.map((driver, index) => (
                  <motion.div
                    key={driver.factor}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 + index * 0.05 }}
                    className="p-4 rounded-xl border bg-card"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{driver.factor}</span>
                      <Badge className={driver.direction === 'positive' ? 'bg-emerald-500/10 text-emerald-500 border-0' : 'bg-red-500/10 text-red-500 border-0'}>
                        {driver.direction === 'positive' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {(driver.impact * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">Korelasyon: {(driver.correlation * 100).toFixed(0)}%</div>
                    <AnimatedProgress
                      value={driver.impact * 100}
                      color={driver.direction === 'positive' ? 'bg-emerald-500' : 'bg-red-500'}
                      delay={0.6 + index * 0.05}
                    />
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Theme Clusters */}
      {themeClusters.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" />
                Tema Kümeleri
              </CardTitle>
              <CardDescription>Geri bildirimlerden otomatik keşfedilen temalar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {(showAllClusters ? themeClusters : themeClusters.slice(0, 6)).map((cluster, index) => (
                  <motion.div
                    key={`${cluster.theme}-${cluster.subTheme}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + index * 0.05 }}
                    className="p-4 rounded-xl border bg-card"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold">{cluster.theme}</h4>
                        {cluster.subTheme && <p className="text-xs text-muted-foreground">{cluster.subTheme}</p>}
                      </div>
                      <Badge className={`border ${getSentimentColor(cluster.sentiment)}`}>
                        {cluster.sentiment === 'positive' ? 'Olumlu' : cluster.sentiment === 'negative' ? 'Olumsuz' : cluster.sentiment === 'mixed' ? 'Karışık' : 'Nötr'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{cluster.count} geri bildirim</span>
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{(cluster.avgScore * 5).toFixed(1)}/5</span>
                    </div>
                    {cluster.keywords && cluster.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {cluster.keywords.slice(0, 5).map(kw => (
                          <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
              {themeClusters.length > 6 && (
                <Button variant="ghost" className="w-full mt-4" onClick={() => setShowAllClusters(!showAllClusters)}>
                  {showAllClusters ? <><ChevronUp className="h-4 w-4 mr-2" />Daha Az Göster</> : <><ChevronDown className="h-4 w-4 mr-2" />Tümünü Göster ({themeClusters.length})</>}
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Deep Theme Analysis */}
      {signals?.topThemes && signals.topThemes.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-violet-500" />
                Tema Performansı
              </CardTitle>
              <CardDescription>Temaların duygu ve skor performansı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {signals.topThemes.map((theme, index) => (
                  <motion.div
                    key={`${theme.theme}-${theme.subTheme || ''}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + index * 0.05 }}
                    className="p-4 rounded-xl border bg-card"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold">{theme.theme}</p>
                        {theme.subTheme && <p className="text-xs text-muted-foreground">{theme.subTheme}</p>}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {theme.count} feedback
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{(theme.avgScore * 5).toFixed(1)}/5</span>
                      <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3 text-emerald-500" />{theme.posRate}%</span>
                      <span className="flex items-center gap-1"><ThumbsDown className="h-3 w-3 text-red-500" />{theme.negRate}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex">
                      <div className="bg-emerald-500" style={{ width: `${theme.posRate}%` }} />
                      <div className="bg-red-500" style={{ width: `${theme.negRate}%` }} />
                      <div className="bg-blue-400" style={{ width: `${Math.max(0, 100 - theme.posRate - theme.negRate)}%` }} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Top Topics */}
      {stats?.topTopics && stats.topTopics.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                En Çok Bahsedilen Konular
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topTopics.slice(0, 8).map((topic, index) => {
                  const maxCount = stats.topTopics[0]?.count || 1;
                  const percentage = (topic.count / maxCount) * 100;
                  return (
                    <motion.div
                      key={topic.topic}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.65 + index * 0.05 }}
                      className="flex items-center gap-3"
                    >
                      <span className="w-24 text-sm font-medium capitalize">{topic.topic}</span>
                      <div className="flex-1">
                        <AnimatedProgress value={percentage} color="bg-blue-500" delay={0.7 + index * 0.05} />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">{topic.count}</span>
                  </motion.div>
                );
              })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Entity Recognition */}
      {signals?.topEntities && signals.topEntities.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-500" />
                Varlık Tanıma
              </CardTitle>
              <CardDescription>Metinden otomatik çıkarılan varlıklar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {signals.topEntities.map((entity, index) => (
                  <motion.div
                    key={`${entity.type}-${entity.name}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65 + index * 0.05 }}
                    className="p-4 rounded-xl border bg-card"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{entity.name}</p>
                        <p className="text-xs text-muted-foreground">{entity.type}</p>
      </div>
                      <Badge variant="outline" className="text-xs">{entity.count}x</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="text-emerald-500">+{entity.posRate}%</span>
                      <span className="text-red-500">-{entity.negRate}%</span>
                      <span className="text-blue-500">{entity.neuRate}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex mt-2">
                      <div className="bg-emerald-500" style={{ width: `${entity.posRate}%` }} />
                      <div className="bg-red-500" style={{ width: `${entity.negRate}%` }} />
                      <div className="bg-blue-400" style={{ width: `${Math.max(0, 100 - entity.posRate - entity.negRate)}%` }} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Emotions */}
      {signals?.topEmotions && signals.topEmotions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.64 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                Duygu Haritası
              </CardTitle>
              <CardDescription>En sık görülen duygu etiketleri</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {signals.topEmotions.map((em) => (
                  <Badge key={em.emotion} variant="outline" className="text-xs">
                    {em.emotion} <span className="ml-1 text-muted-foreground">{em.count}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Action Suggestions Aggregation */}
      {signals?.topActions && signals.topActions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-violet-500" />
                Aksiyon Önerileri (Gerçek Veri)
              </CardTitle>
              <CardDescription>AI tarafından sık önerilen aksiyonlar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signals.topActions.map((action, index) => {
                  const priorityConfig = getPriorityConfig(action.priority);
                  return (
      <motion.div
                      key={`${action.action}-${index}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + index * 0.05 }}
                      className={`p-4 rounded-xl border ${priorityConfig.border} ${priorityConfig.bg}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${priorityConfig.bg}`}>
                          <Lightbulb className={`h-5 w-5 ${priorityConfig.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{action.action}</p>
                            <Badge className={`${priorityConfig.bg} ${priorityConfig.color} ${priorityConfig.border} border`}>
                              {priorityConfig.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {action.category} • {action.impact || 'Etkisi belirtilmemiş'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {action.count} geri bildirimde önerildi
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* AI Deep Learning */}
      {signals && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.68 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-indigo-500" />
                AI Öğrenme ve Adaptasyon
              </CardTitle>
              <CardDescription>Sistem derinliği ve öğrenme kapsamı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">Öğrenme Kapsamı</p>
                  <p className="text-2xl font-bold">{analyzedRate}%</p>
                  <AnimatedProgress value={analyzedRate} color="bg-indigo-500" delay={0.1} />
                </div>
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">Son AI Güncelleme</p>
                  <p className="text-sm font-semibold">
                    {latestProcessedAt ? new Date(latestProcessedAt).toLocaleString('tr-TR') : 'Henüz yok'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {signals.totalAnalyzed} analiz edilmiş kayıt
                  </p>
                </div>
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">Bilgi Derinliği</p>
                  <p className="text-sm font-semibold">
                    {signals.topThemes.length} tema • {signals.topEntities.length} varlık
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {signals.topActions.length} aksiyon deseni
                  </p>
                </div>
              </div>

              {/* Toplu AI Analiz */}
              {analyzedRate < 100 && (
                <div className="mt-4 p-4 rounded-xl border-2 border-dashed border-indigo-500/40 bg-indigo-500/5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4 text-indigo-500" />
                        Feedbackları AI ile Analiz Et
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {signals.totalFeedbacks - signals.totalAnalyzed} feedback henüz yeni AI motoru ile analiz edilmedi.
                        Bu butona tıklayarak tüm feedbacklarınızı intent, urgency, entity, theme, churn gibi derinlikli katmanlarla analiz edebilirsiniz.
                      </p>
                    </div>
                    <Button
                      onClick={handleBulkAnalyze}
                      disabled={bulkAnalyzing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                    >
                      {bulkAnalyzing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analiz Ediliyor...</>
                      ) : (
                        <><Rocket className="h-4 w-4 mr-2" />Toplu AI Analiz Başlat</>
                      )}
                    </Button>
                  </div>
                  {bulkProgress.running && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{bulkProgress.done} / {bulkProgress.total} analiz edildi</span>
                        <span>{bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}%</span>
                      </div>
                      <AnimatedProgress
                        value={bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}
                        color="bg-indigo-500"
                        delay={0}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 grid lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Öğrenme Profili</p>
                      <p className="text-sm font-semibold">
                        {learningStatus?.profile?.status || 'Henüz yok'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Versiyon: {learningStatus?.profile?.version ?? 0} • Eğitim: {learningStatus?.profile?.trainingFeedbackCount ?? 0} kayıt
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Son eğitim: {learningStatus?.profile?.lastTrainedAt ? new Date(learningStatus.profile.lastTrainedAt).toLocaleString('tr-TR') : 'Henüz yok'}
                      </p>
                    </div>
                    <Button onClick={handleUpdateLearningProfile} disabled={learningUpdating} size="sm" variant="secondary">
                      {learningUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Profili Güncelle
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">Embedding ve Düzeltme</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Embedding</p>
                      <p className="font-semibold">{learningStatus?.embeddingsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Düzeltme</p>
                      <p className="font-semibold">{learningStatus?.correctionsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Kullanılan Düzeltme</p>
                      <p className="font-semibold">{learningStatus?.profile?.correctionsUsed ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Düzeltmeler sonraki profil güncellemesinde adaptasyona dahil edilir.
                  </p>
                </div>
              </div>

              <div ref={correctionRef} className="mt-6 p-4 rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Düzeltme Gönder</p>
                    <p className="text-xs text-muted-foreground">Alan ve değeri düzeltip öğrenmeyi güçlendir</p>
                  </div>
                  <Badge variant="secondary">AI Feedback Loop</Badge>
                </div>

                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Feedback</label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.feedbackId}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, feedbackId: event.target.value }))}
                    >
                      <option value="">Geri bildirim seç</option>
                      {visibleFeedbacks.map((fb) => (
                        <option key={fb.id} value={fb.id}>
                          {fb.text.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="Feedback ID (opsiyonel)"
                      value={correctionForm.feedbackId}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, feedbackId: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Alan</label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.field}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, field: event.target.value }))}
                    >
                      <option value="sentiment">sentiment</option>
                      <option value="intent">intent</option>
                      <option value="topics">topics</option>
                      <option value="themes">themes</option>
                      <option value="entities">entities</option>
                      <option value="urgency">urgency</option>
                      <option value="churnRisk">churnRisk</option>
                      <option value="actionSuggestions">actionSuggestions</option>
                      <option value="summary">summary</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Yeni Değer (JSON veya düz metin)</label>
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.newValue}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, newValue: event.target.value }))}
                      placeholder='Örn: \"positive\" veya {\"label\":\"positive\"}'
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Eski Değer (opsiyonel)</label>
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.oldValue}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, oldValue: event.target.value }))}
                      placeholder='Örn: \"neutral\"'
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
                  <Input
                    placeholder="Not (opsiyonel)"
                    value={correctionForm.note}
                    onChange={(event) => setCorrectionForm(prev => ({ ...prev, note: event.target.value }))}
                  />
                  <Button onClick={handleSubmitCorrection} disabled={correctionSubmitting}>
                    {correctionSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Düzeltmeyi Gönder
                  </Button>
                </div>
              </div>

              <div className="mt-6 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Düzeltme Geçmişi</p>
                    <p className="text-xs text-muted-foreground">Son gönderilen düzeltmeler</p>
                  </div>
                  <Badge variant="outline">{corrections.length} kayıt</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {corrections.length === 0 && (
                    <p className="text-sm text-muted-foreground">Henüz düzeltme yok.</p>
                  )}
                  {corrections.map((correction) => (
                    <div key={correction.id} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {new Date(correction.createdAt).toLocaleString('tr-TR')}
                        </div>
                        <Badge variant="secondary">{correction.field}</Badge>
                      </div>
                      <p className="text-sm mt-2">
                        <span className="text-xs text-muted-foreground">Yeni:</span>{' '}
                        {stringifyValue(correction.newValue)}
                      </p>
                      {correction.oldValue !== null && correction.oldValue !== undefined && (
                        <p className="text-sm mt-1">
                          <span className="text-xs text-muted-foreground">Eski:</span>{' '}
                          {stringifyValue(correction.oldValue)}
                        </p>
                      )}
                      {correction.note && (
                        <p className="text-xs text-muted-foreground mt-2">{correction.note}</p>
                      )}
                      {correction.feedback?.text && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Feedback: {correction.feedback.text.slice(0, 120)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Detailed Feedbacks */}
      {detailedFeedbacks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-violet-500" />
                Detaylı Geri Bildirim Analizi
              </CardTitle>
              <CardDescription>Her bir geri bildirimin AI katmanları</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Metin veya müşteri adı ara..."
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  {(['all', 'positive', 'neutral', 'negative', 'mixed'] as const).map((s) => (
                    <Button
                      key={s}
                      variant={sentimentFilter === s ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSentimentFilter(s)}
                    >
                      {s === 'all' ? 'Tümü' : getSentimentConfig(s).label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {visibleFeedbacks.map((fb, index) => {
                  const sentimentConfig = getSentimentConfig(fb.sentiment);
                  const SentimentIcon = sentimentConfig.icon;
                  const urgencyLabel = getUrgencyLabel(fb.urgency);
                  const churnLabel = getChurnLabel(fb.churnRisk);
                  const intentLabel = getIntentLabel(fb.intent);
                  const isExpanded = expandedFeedbackId === fb.id;
                  return (
                    <motion.div
                      key={fb.id}
                      initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.75 + index * 0.03 }}
                      className="p-4 rounded-xl border bg-card"
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{fb.text}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={`text-xs border-0 ${sentimentConfig.bg} ${sentimentConfig.color}`}>
                              <SentimentIcon className="h-3 w-3 mr-1" />
                              {sentimentConfig.label}
                            </Badge>
                            {fb.intent && (
                              <Badge className={`text-xs border ${intentLabel.color}`}>
                                {intentLabel.label}
                              </Badge>
                            )}
                            {fb.emotions.slice(0, 2).map(e => (
                              <Badge key={e} className="text-xs border-0 bg-orange-500/10 text-orange-500">{e}</Badge>
                            ))}
                            {fb.isToxic && (
                              <Badge className="text-xs border-0 bg-red-500/10 text-red-500">Toksik</Badge>
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => selectFeedbackForCorrection(fb.id, fb.text)}
                          >
                            <ListChecks className="h-4 w-4 mr-1" />
                            Düzelt
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => setExpandedFeedbackId(isExpanded ? null : fb.id)}
                          >
                            {isExpanded ? <><ChevronUp className="h-4 w-4 mr-1" />Kapat</> : <><ChevronDown className="h-4 w-4 mr-1" />Detay</>}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 pt-4 border-t space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {fb.urgency !== null && (
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <p className="text-xs text-muted-foreground">Aciliyet</p>
                                <p className={`text-lg font-bold ${urgencyLabel?.color || 'text-emerald-500'}`}>
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
                                <p className="text-xs text-muted-foreground">Churn</p>
                                <p className={`text-lg font-bold ${churnLabel?.color || 'text-emerald-500'}`}>
                                  {(fb.churnRisk * 100).toFixed(0)}%
                                </p>
                              </div>
                            )}
                            {fb.intentScore !== null && (
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <p className="text-xs text-muted-foreground">Niyet Skoru</p>
                                <p className="text-lg font-bold text-violet-500">{(fb.intentScore * 100).toFixed(0)}%</p>
                              </div>
                            )}
                          </div>

                          {fb.topics.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Konular</p>
                              <div className="flex flex-wrap gap-2">
                                {fb.topics.map((t) => (
                                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {fb.statementSentiments.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Cümle Bazlı Duygu Analizi</p>
                              <div className="space-y-2">
                                {fb.statementSentiments.map((ss, i) => {
                                  const ssConfig = getSentimentConfig(ss.sentiment);
                                  return (
                                    <div key={`${ss.statement}-${i}`} className="flex items-center gap-2 text-sm">
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
                                  <Badge key={`${entity.name}-${i}`} variant="outline" className="text-xs">
                                    {entity.name} ({entity.type}) {entity.sentiment === 'positive' ? '👍' : entity.sentiment === 'negative' ? '👎' : '➖'}
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
                                  <Badge
                                    key={`${theme.theme}-${i}`}
                                    className={`text-xs border ${theme.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : theme.sentiment === 'negative' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-blue-500/10 text-blue-500 border-blue-500/30'}`}
                                  >
                                    {theme.theme}{theme.subTheme ? ` > ${theme.subTheme}` : ''}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {fb.actionSuggestions.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Aksiyon Önerileri</p>
                              <div className="space-y-2">
                                {fb.actionSuggestions.map((a, i) => {
                                  const cfg = getPriorityConfig(a.priority);
                                  return (
                                    <div key={`${a.action}-${i}`} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg border bg-card">
                                      <span className="font-medium">{a.action}</span>
                                      <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border`}>{cfg.label}</Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                            <span>AI Model: {fb.aiModelUsed || '-'}</span>
                            <span>Versiyon: {fb.aiVersion || '-'}</span>
                            <span>İşleme: {fb.aiProcessedAt ? new Date(fb.aiProcessedAt).toLocaleString('tr-TR') : 'Bekleniyor'}</span>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              {filteredFeedbacks.length > 10 && (
                <Button variant="ghost" className="w-full mt-4" onClick={() => setShowAllFeedbacks(!showAllFeedbacks)}>
                  {showAllFeedbacks ? <><ChevronUp className="h-4 w-4 mr-2" />Daha Az Göster</> : <><ChevronDown className="h-4 w-4 mr-2" />Tümünü Göster ({filteredFeedbacks.length})</>}
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* AI Recommendations */}
      {report?.recommendations && report.recommendations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
                <Lightbulb className="h-5 w-5 text-white" />
              </div>
              AI Önerileri
            </CardTitle>
            <CardDescription>
              Yapay zeka tarafından oluşturulan kişiselleştirilmiş iyileştirme önerileri
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                {report.recommendations.map((rec, index) => {
                const priorityConfig = getPriorityConfig(rec.priority);
                  const RecIcon = getCategoryIcon(rec.category);
                return (
                  <motion.div
                      key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + index * 0.1 }}
                    className={`p-5 rounded-xl border ${priorityConfig.border} ${priorityConfig.bg}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${priorityConfig.gradient} shrink-0`}>
                        <RecIcon className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-bold text-lg">{rec.text}</h4>
                          <Badge className={`${priorityConfig.bg} ${priorityConfig.color} ${priorityConfig.border} border`}>
                              {priorityConfig.label} Öncelik
                          </Badge>
                        </div>
                          {rec.impact && (
                            <div className="flex items-center gap-2 text-sm mt-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{rec.impact}</span>
                          </div>
                          )}
                          </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      )}

      {/* AI Prediction */}
      {report?.predictedRating && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        <Card className="border-0 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <motion.div 
                  className="p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600"
                    animate={{ boxShadow: ['0 0 20px rgba(139, 92, 246, 0.3)', '0 0 40px rgba(139, 92, 246, 0.5)', '0 0 20px rgba(139, 92, 246, 0.3)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Brain className="h-8 w-8 text-white" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-violet-500" />
                    AI Tahmin
                  </h3>
                  <p className="text-muted-foreground">
                    Önerileri uygularsanız, önümüzdeki 30 gün içinde puanınızın{' '}
                      <span className="text-emerald-500 font-bold text-xl">{report.predictedRating.toFixed(1)}</span>&apos;a
                    çıkması bekleniyor.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.div
                    key={star}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.9 + star * 0.1 }}
                  >
                    <Star 
                        className={`h-8 w-8 ${star <= Math.floor(report.predictedRating) ? 'text-yellow-500 fill-yellow-500' : star - 0.5 <= report.predictedRating ? 'text-yellow-500 fill-yellow-500/50' : 'text-muted-foreground/30'}`}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      )}
    </div>
  );
}
