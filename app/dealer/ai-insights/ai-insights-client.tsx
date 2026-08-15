'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
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
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Link from 'next/link';
import { toast } from '@/lib/admin-toast';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { DashboardPageHero, DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { normalizeSentimentTriplet } from '@/lib/sentiment-percentages';

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

interface DealerStaffMember {
  id: string;
  userId: string;
  user: { id: string; name: string | null; email: string };
}

interface ExistingActionItem {
  suggestionText: string;
  priority: string;
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
  retrainSuggestion?: {
    shouldRetrain: boolean;
    reason: string | null;
    newFeedbackCount: number;
    newCorrectionsCount: number;
  } | null;
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
  scoreLabel,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  scoreLabel: string;
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
        <m.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          className={getColor(value)}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring' }} className="text-4xl font-bold">
          {value}
        </m.span>
        <span className="text-sm text-muted-foreground">{scoreLabel}</span>
      </div>
    </div>
  );
};

// ── Animated Progress Bar ──
const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
    <m.div
      initial={{ width: 0 }}
      animate={{ width: `${value}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }}
      className={`h-full rounded-full ${color}`}
    />
  </div>
);

export default function DealerAIInsightsPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const localeTag = locale === 'en' ? 'en-US' : 'tr-TR';

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
  const [showAllTopActions, setShowAllTopActions] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [savingActionKey, setSavingActionKey] = useState<string | null>(null);
  const [addedActionKeys, setAddedActionKeys] = useState<Record<string, boolean>>({});
  const [staffMembers, setStaffMembers] = useState<DealerStaffMember[]>([]);
  const [actionAssignOpen, setActionAssignOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: string; priority: string; key: string } | null>(null);
  const [assignForm, setAssignForm] = useState({ assignedToId: '', dueAt: '' });
  
  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Theme clusters expand
  const [showAllClusters, setShowAllClusters] = useState(false);

  // Period: haftalık / aylık (API'ye type + period gider)
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly');
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

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
    const fetchStaffMembers = async () => {
      try {
        const response = await fetch('/api/dealer/staff', { cache: 'no-store' });
        const data = await response.json();
        if (data.success && Array.isArray(data.staff)) {
          setStaffMembers(data.staff);
        }
      } catch {
        // staff optional
      }
    };
    fetchStaffMembers();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getPeriodString = () => {
    if (periodType === 'weekly') {
      const d = new Date();
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay() + 1);
      const y = start.getFullYear();
      const w = Math.ceil((start.getDate() + new Date(y, start.getMonth(), 0).getDate()) / 7);
      return `${y}-W${String(w).padStart(2, '0')}`;
    }
    return new Date().toISOString().slice(0, 7);
  };

  const fetchInsights = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const period = getPeriodString();
      const [insightsRes, detailedRes, learningRes] = await Promise.all([
        fetch('/api/ai/analyze?action=insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: periodType, period }),
        }),
        fetch('/api/ai/detailed?limit=50'),
        fetch('/api/ai/learning'),
      ]);

      const insightsData = await insightsRes.json();
      if (insightsData.success) {
        if (insightsData.report) setReport(insightsData.report);
        if (insightsData.themeClusters) setThemeClusters(insightsData.themeClusters);
        if (insightsData.stats) setStats(insightsData.stats);
        setReportGeneratedAt(new Date().toISOString());
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
          retrainSuggestion: learningData.retrainSuggestion ?? null,
        });
        setCorrections(Array.isArray(learningData.corrections) ? learningData.corrections : []);
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
      toast.error(t('dealerAiInsights.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInsights(true);
    setRefreshing(false);
    toast.success(t('dealerAiInsights.toastRefreshed'));
  };

  const buildActionKey = (actionText: string, priority: string) =>
    `${actionText.trim().toLowerCase()}::${priority.trim().toLowerCase()}`;

  useEffect(() => {
    const loadExistingActionKeys = async () => {
      try {
        const statuses = ['pending', 'assigned', 'in_progress'];
        const results = await Promise.all(
          statuses.map((status) =>
            fetch(`/api/dealer/action-items?status=${status}&page=1&pageSize=100`, { cache: 'no-store' }).then((res) =>
              res.json()
            )
          )
        );
        const actionMap: Record<string, boolean> = {};
        results.forEach((result) => {
          const items: ExistingActionItem[] = Array.isArray(result?.items) ? result.items : [];
          items.forEach((item) => {
            if (!item?.suggestionText) return;
            const key = buildActionKey(item.suggestionText, item.priority || 'medium');
            actionMap[key] = true;
          });
        });
        setAddedActionKeys(actionMap);
      } catch {
        // preload optional
      }
    };
    loadExistingActionKeys();
  }, []);

  const handleCreateActionItem = async (
    action: { action: string; priority: string },
    actionKey: string,
    payload?: { assignedToId?: string; dueAt?: string }
  ): Promise<boolean> => {
    setSavingActionKey(actionKey);
    try {
      const response = await fetch('/api/dealer/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionText: action.action,
          priority: ['low', 'medium', 'high'].includes(action.priority) ? action.priority : 'medium',
          sourceModule: 'ai_aggregate',
          assignedToId: payload?.assignedToId || null,
          dueAt: payload?.dueAt ? new Date(payload.dueAt).toISOString() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setAddedActionKeys((prev) => ({ ...prev, [actionKey]: true }));
          toast.success(t('dealerAiInsights.toastActionExists'));
          return true;
        }
        throw new Error(data?.error || t('dealerAiInsights.errActionCreate'));
      }
      setAddedActionKeys((prev) => ({ ...prev, [actionKey]: true }));
      toast.success(t('dealerAiInsights.toastActionAdded'));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('dealerAiInsights.errActionCreate'));
      return false;
    } finally {
      setSavingActionKey(null);
    }
  };

  const openAssignDialog = (action: { action: string; priority: string }, actionKey: string) => {
    setPendingAction({ ...action, key: actionKey });
    setAssignForm({ assignedToId: '', dueAt: '' });
    setActionAssignOpen(true);
  };

  const handlePeriodChange = (type: 'weekly' | 'monthly') => {
    setPeriodType(type);
    setLoading(true);
    const period = type === 'weekly'
      ? (() => { const d = new Date(); const start = new Date(d); start.setDate(d.getDate() - d.getDay() + 1); const y = start.getFullYear(); const w = Math.ceil((start.getDate() + new Date(y, start.getMonth(), 0).getDate()) / 7); return `${y}-W${String(w).padStart(2, '0')}`; })()
      : new Date().toISOString().slice(0, 7);
    fetch('/api/ai/analyze?action=insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, period }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          if (data.report) setReport(data.report);
          if (data.themeClusters) setThemeClusters(data.themeClusters);
          if (data.stats) setStats(data.stats);
          setReportGeneratedAt(new Date().toISOString());
          toast.success(type === 'weekly' ? t('dealerAiInsights.toastReportWeekly') : t('dealerAiInsights.toastReportMonthly'));
        }
      })
      .catch(() => toast.error(t('dealerAiInsights.toastReportFailed')))
      .finally(() => setLoading(false));
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
        toast.success(t('dealerAiInsights.toastLearningUpdated'));
        setLearningStatus(prev => (prev ? { ...prev, profile: data.profile || prev.profile, retrainSuggestion: null } : prev));
      } else {
        toast.error(data.error || t('dealerAiInsights.errLearningUpdate'));
      }
    } catch (error) {
      console.error('Learning update failed:', error);
      toast.error(t('dealerAiInsights.toastLearningFailed'));
    } finally {
      setLearningUpdating(false);
    }
  };

  const handleSubmitCorrection = async () => {
    if (!correctionForm.feedbackId.trim()) {
      toast.error(t('dealerAiInsights.toastFeedbackIdRequired'));
      return;
    }
    if (!correctionForm.field.trim()) {
      toast.error(t('dealerAiInsights.toastFieldRequired'));
      return;
    }

    const newValue = parseMaybeJson(correctionForm.newValue);
    if (newValue === undefined) {
      toast.error(t('dealerAiInsights.toastNewValueRequired'));
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
        toast.success(t('dealerAiInsights.toastCorrectionSaved'));
        setCorrectionForm(prev => ({ ...prev, newValue: '', oldValue: '', note: '' }));
        const statusRes = await fetch('/api/ai/learning');
        const statusData = await statusRes.json();
        if (statusData.success) {
          setLearningStatus({
            profile: statusData.profile || null,
            embeddingsCount: statusData.embeddingsCount ?? 0,
            correctionsCount: statusData.correctionsCount ?? 0,
            retrainSuggestion: statusData.retrainSuggestion ?? null,
          });
          setCorrections(Array.isArray(statusData.corrections) ? statusData.corrections : []);
        }
      } else {
        toast.error(data.error || t('dealerAiInsights.errCorrectionSave'));
      }
    } catch (error) {
      console.error('Correction submit failed:', error);
      toast.error(t('dealerAiInsights.toastCorrectionFailed'));
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const handleBulkAnalyze = async () => {
    if (bulkAnalyzing) return;
    setBulkAnalyzing(true);
    setBulkProgress({ done: 0, total: 0, running: true });
    toast.info(t('dealerAiInsights.toastBulkStarting'));

    try {
      // Analiz edilmemiş feedbackları bul
      const unanalyzedIds = detailedFeedbacks
        .filter(fb => !fb.intent && fb.text)
        .map(fb => fb.id);

      if (unanalyzedIds.length === 0) {
        toast.info(t('dealerAiInsights.toastBulkNone'));
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

      toast.success(t('dealerAiInsights.toastBulkDone'));
      setBulkProgress(prev => ({ ...prev, running: false }));

      // Profili güncelle
      try {
        await fetch('/api/ai/learning?action=update_profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch (err) {
        console.warn('Profil güncelleme atlandı:', err);
      }

      // Sayfayı yenile
      await fetchInsights(true);
    } catch (error) {
      console.error('Bulk analyze failed:', error);
      toast.error(t('dealerAiInsights.toastBulkFailed'));
    } finally {
      setBulkAnalyzing(false);
      setBulkProgress(prev => ({ ...prev, running: false }));
    }
  };

  const selectFeedbackForCorrection = (feedbackId: string, preview?: string) => {
    setCorrectionForm(prev => ({
      ...prev,
      feedbackId,
      note: prev.note || (preview ? `${t('dealerAiInsights.quickPickPrefix')} ${preview.slice(0, 120)}` : prev.note),
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
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error || t('dealerAiInsights.chatErrorGeneric'), timestamp: new Date().toISOString() }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: t('dealerAiInsights.chatErrorConnection'), timestamp: new Date().toISOString() }]);
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
        return { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', label: priority === 'critical' ? t('dealerAiInsights.priorityCritical') : t('dealerAiInsights.priorityHigh'), gradient: 'from-red-500 to-red-700' };
      case 'medium':
        return { color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: t('dealerAiInsights.priorityMedium'), gradient: 'from-yellow-500 to-orange-500' };
      default:
        return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: t('dealerAiInsights.priorityLow'), gradient: 'from-emerald-500 to-teal-600' };
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
        return { label: t('dealerAiInsights.sentimentPositive'), color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: ThumbsUp };
      case 'negative':
        return { label: t('dealerAiInsights.sentimentNegative'), color: 'text-red-500', bg: 'bg-red-500/10', icon: ThumbsDown };
      case 'mixed':
        return { label: t('dealerAiInsights.sentimentMixed'), color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: AlertTriangle };
      default:
        return { label: t('dealerAiInsights.sentimentNeutral'), color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Minus };
    }
  };

  const getIntentLabel = (intent?: string | null) => {
    switch ((intent || '').toLowerCase()) {
      case 'complaint':
        return { label: t('dealerAiInsights.intentComplaint'), color: 'bg-red-500/10 text-red-500 border-red-500/20' };
      case 'suggestion':
        return { label: t('dealerAiInsights.intentSuggestion'), color: 'border-primary/20 bg-primary/10 text-primary' };
      case 'praise':
        return { label: t('dealerAiInsights.intentPraise'), color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
      case 'question':
        return { label: t('dealerAiInsights.intentQuestion'), color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
      default:
        return { label: t('dealerAiInsights.intentGeneral'), color: 'bg-muted text-muted-foreground border-muted' };
    }
  };

  const getUrgencyLabel = (value: number | null) => {
    if (value == null) return null;
    if (value < 0.3) return { label: t('dealerAiInsights.priorityLow'), color: 'text-emerald-500' };
    if (value < 0.5) return { label: t('dealerAiInsights.priorityMedium'), color: 'text-yellow-500' };
    if (value < 0.7) return { label: t('dealerAiInsights.priorityHigh'), color: 'text-orange-500' };
    return { label: t('dealerAiInsights.priorityCritical'), color: 'text-red-500' };
  };

  const getChurnLabel = (value: number | null) => {
    if (value == null) return null;
    if (value < 0.25) return { label: t('dealerAiInsights.churnSafe'), color: 'text-emerald-500' };
    if (value < 0.5) return { label: t('dealerAiInsights.churnLow'), color: 'text-yellow-500' };
    if (value < 0.75) return { label: t('dealerAiInsights.churnMedium'), color: 'text-orange-500' };
    return { label: t('dealerAiInsights.churnHigh'), color: 'text-red-500' };
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
  const visibleTopActions = showAllTopActions ? (signals?.topActions || []) : (signals?.topActions || []).slice(0, 5);
  const visibleRecommendations = showAllRecommendations ? (report?.recommendations || []) : (report?.recommendations || []).slice(0, 5);

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
  const normalizedSentiment = normalizeSentimentTriplet(
    {
      positive: stats?.sentimentDistribution?.positive ?? 0,
      neutral: stats?.sentimentDistribution?.neutral ?? 0,
      negative: stats?.sentimentDistribution?.negative ?? 0,
    },
    { autoScaleRatio: true }
  );
  const topicKeys = ['service', 'speed', 'quality', 'price', 'cleanliness', 'location', 'ambience', 'support', 'staff', 'wait'] as const;
  const topicLabelMap = useMemo(
    () =>
      Object.fromEntries(topicKeys.map((k) => [k, t(`dealerAiInsights.topics.${k}`)])) as Record<string, string>,
    [t],
  );
  const emotionKeys = ['happy', 'joy', 'satisfied', 'neutral', 'disappointed', 'angry', 'frustrated', 'upset', 'confused', 'excited'] as const;
  const emotionLabelMap = useMemo(
    () =>
      Object.fromEntries(emotionKeys.map((k) => [k, t(`dealerAiInsights.emotions.${k}`)])) as Record<string, string>,
    [t],
  );
  const toLocalizedLabel = (value: string, map: Record<string, string>) => {
    const normalized = value.trim().toLowerCase();
    return map[normalized] || value;
  };

  const intentItems = useMemo(
    () => [
      { key: 'complaint', label: t('dealerAiInsights.intentComplaint'), color: 'bg-red-500' },
      { key: 'suggestion', label: t('dealerAiInsights.intentSuggestion'), color: 'bg-primary' },
      { key: 'praise', label: t('dealerAiInsights.intentPraise'), color: 'bg-emerald-500' },
      { key: 'question', label: t('dealerAiInsights.intentQuestion'), color: 'bg-blue-500' },
      { key: 'general', label: t('dealerAiInsights.intentGeneral'), color: 'bg-slate-500' },
    ],
    [t],
  );

  const urgencyItems = useMemo(
    () => [
      { key: 'low', label: t('dealerAiInsights.priorityLow'), color: 'bg-emerald-500' },
      { key: 'medium', label: t('dealerAiInsights.priorityMedium'), color: 'bg-yellow-500' },
      { key: 'high', label: t('dealerAiInsights.priorityHigh'), color: 'bg-orange-500' },
      { key: 'critical', label: t('dealerAiInsights.priorityCritical'), color: 'bg-red-500' },
    ],
    [t],
  );

  const churnItems = useMemo(
    () => [
      { key: 'safe', label: t('dealerAiInsights.churnSafe'), color: 'bg-emerald-500' },
      { key: 'low', label: t('dealerAiInsights.churnLow'), color: 'bg-yellow-500' },
      { key: 'medium', label: t('dealerAiInsights.churnMedium'), color: 'bg-orange-500' },
      { key: 'high', label: t('dealerAiInsights.churnHigh'), color: 'bg-red-500' },
    ],
    [t],
  );

  if (loading) {
  return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('dealerAiInsights.loadingInsights')}</p>
      </div>
    );
  }

  // No data state
  if (!report && !stats && detailedFeedbacks.length === 0 && !signals) {
    return (
      <LazyMotion features={domAnimation} strict>
      <div className="space-y-6 pb-8">
        <DashboardPageHero
          eyebrow={t('dealerAiInsights.emptyEyebrow')}
          title={t('dealerAiInsights.emptyHeroTitle')}
          description={t('dealerAiInsights.emptyHeroDesc')}
          icon={<Sparkles className="h-7 w-7" aria-hidden />}
          tone="auto"
        />
        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-12 text-center">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-xl font-bold mb-2">{t('dealerAiInsights.dataWaitingTitle')}</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t('dealerAiInsights.dataWaitingBody')}
            </p>
          </CardContent>
        </Card>
      </div>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
    <div className="space-y-6 pb-8">
      <DashboardPageHeroChrome tone="auto" padded={false}>
        <m.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="relative px-6 py-6 md:px-8 md:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <m.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Cpu className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="text-pretty">{t('dealerAiInsights.heroChip')}</span>
              </m.div>
              <m.h1
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.06 }}
                className="flex items-center gap-3 text-balance text-2xl font-bold tracking-tight text-foreground md:text-4xl"
              >
                <Sparkles className="h-9 w-9 shrink-0 text-primary" aria-hidden /> {t('dealerAiInsights.heroTitle')}
              </m.h1>
              <m.p
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 }}
                className="mt-2 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground"
              >
                {t('dealerAiInsights.heroSubtitle')}
              </m.p>
              <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => handlePeriodChange('weekly')}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      periodType === 'weekly'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('dealerAiInsights.periodWeekly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePeriodChange('monthly')}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      periodType === 'monthly'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('dealerAiInsights.periodMonthly')}
                  </button>
                </div>
                {reportGeneratedAt && (
                  <span className="text-xs text-muted-foreground">
                    {t('dealerAiInsights.lastUpdatedPrefix')}{' '}
                    {new Date(reportGeneratedAt).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </m.div>
            </div>
            <m.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:flex-col xl:flex-row"
            >
              {report && (
                <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur-sm dark:bg-card/60">
                  <CircularProgress value={report.overallScore} size={100} strokeWidth={10} scoreLabel={t('dealerAiInsights.scoreShort')} />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('dealerAiInsights.overallScoreLabel')}</p>
                    <div className="flex items-center gap-2">
                      {report.trend === 'up' ? (
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                      ) : report.trend === 'down' ? (
                        <TrendingDown className="h-5 w-5 text-red-500" />
                      ) : (
                        <Minus className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span
                        className={`font-semibold ${
                          report.trend === 'up'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : report.trend === 'down'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {report.trend === 'up' ? '+' : ''}
                        {report.trendValue.toFixed(1)} {t('dealerAiInsights.trendThisPeriod')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t('dealerAiInsights.feedbacksAnalyzedLine').replace('{count}', String(report.totalFeedbacks))}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Button onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? t('dealerAiInsights.refreshing') : t('dealerAiInsights.refresh')}
                </Button>
                <Button onClick={() => setChatOpen(!chatOpen)} variant="outline">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('dealerAiInsights.askAi')}
                </Button>
              </div>
            </m.div>
          </div>
        </m.div>
      </DashboardPageHeroChrome>

      {/* Bu rapor nasıl üretildi? — Şeffaflık / güven */}
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="border-0 bg-muted/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4 text-primary" />
              {t('dealerAiInsights.reportHowTitle')}
            </span>
            {showHowItWorks ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {showHowItWorks && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <CardContent className="pt-0 pb-4 text-sm text-muted-foreground space-y-2 border-t">
                  <p><strong className="text-foreground">{t('dealerAiInsights.methodologyStep1Lead')}</strong>{t('dealerAiInsights.methodologyStep1Body')}</p>
                  <p><strong className="text-foreground">{t('dealerAiInsights.methodologyStep2Lead')}</strong>{t('dealerAiInsights.methodologyStep2Body')}</p>
                  <p><strong className="text-foreground">{t('dealerAiInsights.methodologyStep3Lead')}</strong>{t('dealerAiInsights.methodologyStep3Body')}</p>
                  <p><strong className="text-foreground">{t('dealerAiInsights.methodologyStep4Lead')}</strong>{t('dealerAiInsights.methodologyStep4Body')}</p>
                </CardContent>
              </m.div>
            )}
          </AnimatePresence>
        </Card>
      </m.div>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {chatOpen && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bot className="h-5 w-5 text-primary" />
                  {t('dealerAiInsights.assistantTitle')}
                </CardTitle>
                <CardDescription>
                  {t('dealerAiInsights.assistantSubtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Chat Messages */}
                <div className="max-h-[400px] overflow-y-auto space-y-3 mb-4 p-3 rounded-xl bg-muted/30">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">{t('dealerAiInsights.chatWelcome')}</p>
                      <div className="flex flex-wrap gap-2 justify-center mt-4">
                        {[t('dealerAiInsights.quickQuestion1'), t('dealerAiInsights.quickQuestion2'), t('dealerAiInsights.quickQuestion3')].map(q => (
                          <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => { sendQuickMessage(q); }}>
                            {q}
              </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <m.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="p-2 rounded-lg bg-primary/10 h-fit">
                          <Bot className="h-4 w-4 text-primary" />
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
            </m.div>
                  ))}
                  {chatLoading && (
                    <div className="flex gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 h-fit">
                        <Bot className="h-4 w-4 text-primary" />
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
                    placeholder={t('dealerAiInsights.chatPlaceholder')}
                    disabled={chatLoading}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={chatLoading || !chatInput.trim()} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
      </m.div>
        )}
      </AnimatePresence>

      {/* Alerts */}
      {report?.alerts && report.alerts.length > 0 && (
      <div className="space-y-2">
          {report.alerts.map((alert, index) => {
            const config = getAlertConfig(alert.severity);
          const AlertIcon = config.icon;
          return (
              <m.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}>
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
            </m.div>
          );
        })}
      </div>
      )}

      {/* AI Analiz Özeti */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{t('dealerAiInsights.sectionAiAnalysisTitle')}</h2>
      </div>

      {/* Key Metrics */}
      {report?.keyMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: t('dealerAiInsights.metricAvgRating'), value: `${report.keyMetrics.avgRating.toFixed(1)}/5`, icon: Star, color: 'text-yellow-500' },
            { label: t('dealerAiInsights.metricNps'), value: report.keyMetrics.nps.toString(), icon: TrendingUp, color: report.keyMetrics.nps >= 50 ? 'text-emerald-500' : report.keyMetrics.nps >= 0 ? 'text-yellow-500' : 'text-red-500' },
            { label: t('dealerAiInsights.metricCsat'), value: `${report.keyMetrics.csat}%`, icon: ThumbsUp, color: report.keyMetrics.csat >= 70 ? 'text-emerald-500' : 'text-yellow-500' },
            { label: t('dealerAiInsights.metricCes'), value: report.keyMetrics.ces.toFixed(1), icon: Activity, color: report.keyMetrics.ces <= 3 ? 'text-emerald-500' : 'text-yellow-500' },
            { label: t('dealerAiInsights.metricResponseRate'), value: `${report.keyMetrics.responseRate}%`, icon: MessageSquare, color: 'text-blue-500' },
          ].map((metric, index) => {
            const MetricIcon = metric.icon;
            return (
              <m.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.05 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <MetricIcon className={`h-5 w-5 mx-auto mb-2 ${metric.color}`} />
                    <p className="text-2xl font-bold">{metric.value}</p>
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                  </CardContent>
                </Card>
              </m.div>
            );
          })}
        </div>
      )}

      {/* Sentiment Distribution */}
      {stats?.sentimentDistribution && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.sentimentDistTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
      <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <ThumbsUp className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
                  <p className="text-3xl font-bold text-emerald-500">{normalizedSentiment.positive}%</p>
                  <p className="text-sm text-muted-foreground">{t('dealerAiInsights.sentimentPositive')}</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <Minus className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                  <p className="text-3xl font-bold text-blue-500">{normalizedSentiment.neutral}%</p>
                  <p className="text-sm text-muted-foreground">{t('dealerAiInsights.sentimentNeutral')}</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <ThumbsDown className="h-6 w-6 mx-auto text-red-500 mb-2" />
                  <p className="text-3xl font-bold text-red-500">{normalizedSentiment.negative}%</p>
                  <p className="text-sm text-muted-foreground">{t('dealerAiInsights.sentimentNegative')}</p>
                </div>
              </div>
              {/* Sentiment bar */}
              <div className="mt-4 h-4 rounded-full overflow-hidden flex">
                <m.div initial={{ width: 0 }} animate={{ width: `${normalizedSentiment.positive}%` }} transition={{ duration: 1 }} className="bg-emerald-500" />
                <m.div initial={{ width: 0 }} animate={{ width: `${normalizedSentiment.neutral}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-blue-400" />
                <m.div initial={{ width: 0 }} animate={{ width: `${normalizedSentiment.negative}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-red-500" />
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Gelişmiş AI */}
      <div className="flex items-center gap-2 pt-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{t('dealerAiInsights.advancedAiTitle')}</h2>
      </div>

      {/* Experience Signals */}
      {signals && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.experienceSignalsTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.experienceSignalsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t('dealerAiInsights.statTotalFeedback')}</p>
                  <p className="text-2xl font-bold">{signals.totalFeedbacks}</p>
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t('dealerAiInsights.statAiCoverage')}</p>
                  <p className="text-2xl font-bold">{analyzedRate}%</p>
                  <AnimatedProgress value={analyzedRate} color="bg-primary" delay={0.1} />
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t('dealerAiInsights.statAvgEffort')}</p>
                  <p className={`text-2xl font-bold ${signals.avgEffort > 0.7 ? 'text-red-500' : signals.avgEffort > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {(signals.avgEffort * 10).toFixed(1)}/10
                  </p>
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t('dealerAiInsights.statAvgUrgency')}</p>
                  <p className={`text-2xl font-bold ${signals.avgUrgency > 0.7 ? 'text-red-500' : signals.avgUrgency > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {(signals.avgUrgency * 10).toFixed(1)}/10
                  </p>
                </div>
                <div className="p-4 rounded-xl border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t('dealerAiInsights.statAvgChurnRisk')}</p>
                  <p className={`text-2xl font-bold ${signals.avgChurnRisk > 0.7 ? 'text-red-500' : signals.avgChurnRisk > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {(signals.avgChurnRisk * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              </CardContent>
            </Card>
          </m.div>
      )}

      {/* Intent / Urgency / Churn Distributions */}
      {signals && (() => {
        const totalIntent = sumRecord(signals.intentDist);
        const totalUrgency = sumRecord(signals.urgencyBuckets);
        const totalChurn = sumRecord(signals.churnBuckets);
        return (
          <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  {t('dealerAiInsights.distributionCardTitle')}
                </CardTitle>
                <CardDescription>{t('dealerAiInsights.distributionCardDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" /> {t('dealerAiInsights.intentAxisTitle')}
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
                      <AlertTriangle className="h-4 w-4 text-orange-500" /> {t('dealerAiInsights.urgencyAxisTitle')}
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
                      <Shield className="h-4 w-4 text-emerald-500" /> {t('dealerAiInsights.churnAxisTitle')}
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
          </m.div>
        );
      })()}

      {/* Summary */}
      {report?.summary && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="shrink-0 rounded-xl bg-primary p-3 text-primary-foreground">
                  <Brain className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h3 className="mb-2 flex items-center gap-2 font-bold">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                    {t('dealerAiInsights.aiSummaryTitle')}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{report.summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Strengths & Weaknesses */}
      {report && (
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Strengths */}
          <m.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-500">
                  <ThumbsUp className="h-5 w-5" /> {t('dealerAiInsights.strengthsTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.strengthsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {report.strengths.map((item, index) => (
                  <m.div
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
                  </m.div>
                ))}
            </CardContent>
          </Card>
        </m.div>

        {/* Weaknesses */}
          <m.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                  <ThumbsDown className="h-5 w-5" /> {t('dealerAiInsights.weaknessesTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.weaknessesDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {report.weaknesses.map((item, index) => (
                  <m.div
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
                  </m.div>
                ))}
              </CardContent>
            </Card>
          </m.div>
        </div>
      )}

      {/* Key Drivers */}
      {report?.keyDrivers && report.keyDrivers.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.keyFactorsTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.keyFactorsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {report.keyDrivers.map((driver, index) => (
                  <m.div
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
                    <div className="text-xs text-muted-foreground mb-2">{t('dealerAiInsights.correlationLabel').replace('{pct}', (driver.correlation * 100).toFixed(0))}</div>
                    <AnimatedProgress
                      value={driver.impact * 100}
                      color={driver.direction === 'positive' ? 'bg-emerald-500' : 'bg-red-500'}
                      delay={0.6 + index * 0.05}
                    />
                  </m.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Theme Clusters */}
      {themeClusters.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.themeClustersTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.themeClustersDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {(showAllClusters ? themeClusters : themeClusters.slice(0, 6)).map((cluster, index) => (
                  <m.div
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
                        {cluster.sentiment === 'positive' ? t('dealerAiInsights.sentimentPositive') : cluster.sentiment === 'negative' ? t('dealerAiInsights.sentimentNegative') : cluster.sentiment === 'mixed' ? t('dealerAiInsights.sentimentMixed') : t('dealerAiInsights.sentimentNeutral')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{t('dealerAiInsights.feedbackCountShort').replace('{count}', String(cluster.count))}</span>
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{(cluster.avgScore * 5).toFixed(1)}/5</span>
                    </div>
                    {cluster.keywords && cluster.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {cluster.keywords.slice(0, 5).map(kw => (
                          <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    )}
                  </m.div>
                ))}
              </div>
              {themeClusters.length > 6 && (
                <Button variant="ghost" className="w-full mt-4" onClick={() => setShowAllClusters(!showAllClusters)}>
                  {showAllClusters ? <><ChevronUp className="h-4 w-4 mr-2" />{t('dealerAiInsights.showLess')}</> : <><ChevronDown className="h-4 w-4 mr-2" />{t('dealerAiInsights.showAllWithCount').replace('{count}', String(themeClusters.length))}</>}
                </Button>
              )}
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Deep Theme Analysis */}
      {signals?.topThemes && signals.topThemes.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.themePerformanceTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.themePerformanceDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {signals.topThemes.map((theme, index) => (
                  <m.div
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
                        {t('dealerAiInsights.feedbackCountShort').replace('{count}', String(theme.count))}
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
                  </m.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Top Topics */}
      {stats?.topTopics && stats.topTopics.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                {t('dealerAiInsights.topTopicsTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topTopics.slice(0, 8).map((topic, index) => {
                  const maxCount = stats.topTopics[0]?.count || 1;
                  const percentage = (topic.count / maxCount) * 100;
                  return (
                    <m.div
                      key={topic.topic}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.65 + index * 0.05 }}
                      className="flex items-center gap-3"
                    >
                      <span className="w-24 text-sm font-medium capitalize">{toLocalizedLabel(topic.topic, topicLabelMap)}</span>
                      <div className="flex-1">
                        <AnimatedProgress value={percentage} color="bg-blue-500" delay={0.7 + index * 0.05} />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">{topic.count}</span>
                  </m.div>
                );
              })}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Entity Recognition */}
      {signals?.topEntities && signals.topEntities.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-500" />
                {t('dealerAiInsights.entityRecognitionTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.entityRecognitionDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {signals.topEntities.map((entity, index) => (
                  <m.div
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
                  </m.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Emotions */}
      {signals?.topEmotions && signals.topEmotions.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.64 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                {t('dealerAiInsights.sentimentMapTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.sentimentMapDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signals.topEmotions.slice(0, 8).map((em, index) => {
                  const maxEmotionCount = signals.topEmotions[0]?.count || 1;
                  const ratio = Math.max(6, Math.round((em.count / maxEmotionCount) * 100));
                  return (
                    <div key={em.emotion} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{toLocalizedLabel(em.emotion, emotionLabelMap)}</span>
                        <span className="text-xs text-muted-foreground">{t('dealerAiInsights.feedbackCountShort').replace('{count}', String(em.count))}</span>
                      </div>
                      <m.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ratio}%` }}
                        transition={{ delay: 0.2 + index * 0.05, duration: 0.5 }}
                        className="h-2 rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Action Suggestions Aggregation */}
      {signals?.topActions && signals.topActions.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.topActionsTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.topActionsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
                {visibleTopActions.map((action, index) => {
                  const priorityConfig = getPriorityConfig(action.priority);
                  const actionKey = buildActionKey(action.action, action.priority);
                  return (
      <m.div
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
                            <div className="flex items-center gap-2">
                              {addedActionKeys[actionKey] && (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {t('dealerAiInsights.onActionList')}
                                </Badge>
                              )}
                              <Badge className={`${priorityConfig.bg} ${priorityConfig.color} ${priorityConfig.border} border`}>
                                {priorityConfig.label}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {action.category} • {action.impact || t('dealerAiInsights.impactUnknown')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('dealerAiInsights.actionSuggestedIn').replace('{count}', String(action.count))}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={() => openAssignDialog(action, actionKey)}
                            disabled={savingActionKey === actionKey || !!addedActionKeys[actionKey]}
                          >
                            {savingActionKey === actionKey ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <ListChecks className="h-4 w-4 mr-2" />
                            )}
                            {addedActionKeys[actionKey] ? t('dealerAiInsights.onActionList') : t('dealerAiInsights.addToActionList')}
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="mt-2">
                            <Link href={`/dealer/action-items?q=${encodeURIComponent(action.action)}`}>{t('dealerAiInsights.goToActions')}</Link>
                          </Button>
                        </div>
                      </div>
                    </m.div>
                  );
                })}
              </div>
              {signals.topActions.length > 5 && (
                <Button
                  variant="ghost"
                  className="w-full mt-4"
                  onClick={() => setShowAllTopActions(!showAllTopActions)}
                >
                  {showAllTopActions ? <><ChevronUp className="h-4 w-4 mr-2" />{t('dealerAiInsights.showLess')}</> : <><ChevronDown className="h-4 w-4 mr-2" />{t('dealerAiInsights.loadMoreWithCount').replace('{count}', String(signals.topActions.length))}</>}
                </Button>
              )}
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* AI Deep Learning */}
      {signals && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.68 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.learningCardTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.learningCardDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-semibold">{t('dealerAiInsights.howToUseTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dealerAiInsights.howToUseBody')}
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">{t('dealerAiInsights.learningScopeLabel')}</p>
                  <p className="text-2xl font-bold">{analyzedRate}%</p>
                  <AnimatedProgress value={analyzedRate} color="bg-primary" delay={0.1} />
                </div>
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">{t('dealerAiInsights.lastAiUpdateLabel')}</p>
                  <p className="text-sm font-semibold">
                    {latestProcessedAt ? new Date(latestProcessedAt).toLocaleString(localeTag) : t('dealerAiInsights.notYet')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dealerAiInsights.analyzedRecordsLine').replace('{count}', String(signals.totalAnalyzed))}
                  </p>
                </div>
                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">{t('dealerAiInsights.infoDepthLabel')}</p>
                  <p className="text-sm font-semibold">
                    {t('dealerAiInsights.themeEntityActionLine')
                      .replace('{themes}', String(signals.topThemes.length))
                      .replace('{entities}', String(signals.topEntities.length))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dealerAiInsights.actionPatternsLine').replace('{count}', String(signals.topActions.length))}
                  </p>
                </div>
              </div>

              {/* Toplu AI Analiz */}
              {analyzedRate < 100 && (
                <div className="mt-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        {t('dealerAiInsights.bulkAnalyzeTitle')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('dealerAiInsights.bulkAnalyzeBody').replace('{pending}', String(signals.totalFeedbacks - signals.totalAnalyzed))}
                      </p>
                    </div>
                    <Button
                      onClick={handleBulkAnalyze}
                      disabled={bulkAnalyzing}
                      className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {bulkAnalyzing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('dealerAiInsights.bulkAnalyzing')}</>
                      ) : (
                        <><Rocket className="h-4 w-4 mr-2" />{t('dealerAiInsights.bulkAnalyzeCta')}</>
                      )}
                    </Button>
                  </div>
                  {bulkProgress.running && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{t('dealerAiInsights.bulkProgressLine').replace('{done}', String(bulkProgress.done)).replace('{total}', String(bulkProgress.total))}</span>
                        <span>{bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}%</span>
                      </div>
                      <AnimatedProgress
                        value={bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}
                        color="bg-primary"
                        delay={0}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Öğrenme / güncelleme önerisi banner */}
              {learningStatus?.retrainSuggestion?.shouldRetrain && learningStatus.retrainSuggestion.reason && (
                <div className="mt-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-wrap items-center gap-3">
                  <p className="flex-1 text-sm text-foreground">
                    <strong>{t('dealerAiInsights.retrainBannerLead')}</strong> {learningStatus.retrainSuggestion.reason}
                  </p>
                  <Button onClick={handleUpdateLearningProfile} disabled={learningUpdating} size="sm" variant="outline" className="border-amber-500/30">
                    {learningUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    {t('dealerAiInsights.updateProfile')}
                  </Button>
                </div>
              )}

              <div className="mt-6 grid lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t('dealerAiInsights.learningProfileTitle')}</p>
                      <p className="text-sm font-semibold">
                        {learningStatus?.profile?.status || t('dealerAiInsights.notYet')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('dealerAiInsights.learningProfileHint')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t('dealerAiInsights.profileMetaLine')
                          .replace('{version}', String(learningStatus?.profile?.version ?? 0))
                          .replace('{count}', String(learningStatus?.profile?.trainingFeedbackCount ?? 0))
                          .replace('{last}', learningStatus?.profile?.lastTrainedAt ? new Date(learningStatus.profile.lastTrainedAt).toLocaleString(localeTag) : t('dealerAiInsights.notYet'))}
                      </p>
                    </div>
                    <Button onClick={handleUpdateLearningProfile} disabled={learningUpdating} size="sm" variant="secondary">
                      {learningUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      {t('dealerAiInsights.updateProfile')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                    {t('dealerAiInsights.whenToUpdateHint')}
                  </p>
                </div>

                <div className="p-4 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">{t('dealerAiInsights.embeddingCorrectionTitle')}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">{t('dealerAiInsights.embeddingLabel')}</p>
                      <p className="font-semibold">{learningStatus?.embeddingsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">{t('dealerAiInsights.correctionLabel')}</p>
                      <p className="font-semibold">{learningStatus?.correctionsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">{t('dealerAiInsights.correctionsUsedLabel')}</p>
                      <p className="font-semibold">{learningStatus?.profile?.correctionsUsed ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('dealerAiInsights.correctionsIncludedHint')}
                  </p>
                </div>
              </div>

              <div ref={correctionRef} className="mt-6 p-4 rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{t('dealerAiInsights.submitCorrectionTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('dealerAiInsights.submitCorrectionDesc')}</p>
                  </div>
                  <Badge variant="secondary">{t('dealerAiInsights.feedbackLoopBadge')}</Badge>
                </div>

                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t('dealerAiInsights.feedbackSelectLabel')}</label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.feedbackId}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, feedbackId: event.target.value }))}
                    >
                      <option value="">{t('dealerAiInsights.selectFeedbackPlaceholder')}</option>
                      {visibleFeedbacks.map((fb) => (
                        <option key={fb.id} value={fb.id}>
                          {fb.text.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder={t('dealerAiInsights.feedbackIdOptionalPlaceholder')}
                      value={correctionForm.feedbackId}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, feedbackId: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t('dealerAiInsights.fieldLabel')}</label>
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
                    <label className="text-xs text-muted-foreground">{t('dealerAiInsights.newValueLabel')}</label>
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.newValue}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, newValue: event.target.value }))}
                      placeholder={t('dealerAiInsights.newValuePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t('dealerAiInsights.oldValueLabel')}</label>
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={correctionForm.oldValue}
                      onChange={(event) => setCorrectionForm(prev => ({ ...prev, oldValue: event.target.value }))}
                      placeholder={t('dealerAiInsights.oldValuePlaceholder')}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
                  <Input
                    placeholder={t('dealerAiInsights.noteOptionalPlaceholder')}
                    value={correctionForm.note}
                    onChange={(event) => setCorrectionForm(prev => ({ ...prev, note: event.target.value }))}
                  />
                  <Button onClick={handleSubmitCorrection} disabled={correctionSubmitting}>
                    {correctionSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    {t('dealerAiInsights.submitCorrectionCta')}
                  </Button>
                </div>
              </div>

              <div className="mt-6 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{t('dealerAiInsights.correctionHistoryTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('dealerAiInsights.correctionHistoryDesc')}</p>
                  </div>
                  <Badge variant="outline">{t('dealerAiInsights.recordsCount').replace('{count}', String(corrections.length))}</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {corrections.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t('dealerAiInsights.noCorrectionsYet')}</p>
                  )}
                  {corrections.map((correction) => (
                    <div key={correction.id} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {new Date(correction.createdAt).toLocaleString(localeTag)}
                        </div>
                        <Badge variant="secondary">{correction.field}</Badge>
                      </div>
                      <p className="text-sm mt-2">
                        <span className="text-xs text-muted-foreground">{t('dealerAiInsights.newValueShort')}</span>{' '}
                        {stringifyValue(correction.newValue)}
                      </p>
                      {correction.oldValue !== null && correction.oldValue !== undefined && (
                        <p className="text-sm mt-1">
                          <span className="text-xs text-muted-foreground">{t('dealerAiInsights.oldValueShort')}</span>{' '}
                          {stringifyValue(correction.oldValue)}
                        </p>
                      )}
                      {correction.note && (
                        <p className="text-xs text-muted-foreground mt-2">{correction.note}</p>
                      )}
                      {correction.feedback?.text && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {t('dealerAiInsights.feedbackPrefix')} {correction.feedback.text.slice(0, 120)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Detailed Feedbacks */}
      {detailedFeedbacks.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {t('dealerAiInsights.detailedFeedbackTitle')}
              </CardTitle>
              <CardDescription>{t('dealerAiInsights.detailedFeedbackDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('dealerAiInsights.searchPlaceholder')}
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
                      {s === 'all' ? t('dealerAiInsights.filterAll') : getSentimentConfig(s).label}
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
                    <m.div
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
                              <Badge key={e} className="text-xs border-0 bg-orange-500/10 text-orange-500">{toLocalizedLabel(e, emotionLabelMap)}</Badge>
                            ))}
                            {fb.isToxic && (
                              <Badge className="text-xs border-0 bg-red-500/10 text-red-500">{t('dealerAiInsights.toxic')}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={`h-3 w-3 ${s <= fb.rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'}`} />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{new Date(fb.createdAt).toLocaleDateString(localeTag)}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => selectFeedbackForCorrection(fb.id, fb.text)}
                          >
                            <ListChecks className="h-4 w-4 mr-1" />
                            {t('dealerAiInsights.correct')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => setExpandedFeedbackId(isExpanded ? null : fb.id)}
                          >
                            {isExpanded ? <><ChevronUp className="h-4 w-4 mr-1" />{t('dealerAiInsights.close')}</> : <><ChevronDown className="h-4 w-4 mr-1" />{t('dealerAiInsights.detail')}</>}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 pt-4 border-t space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {fb.urgency !== null && (
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <p className="text-xs text-muted-foreground">{t('dealerAiInsights.urgencyLabel')}</p>
                                <p className={`text-lg font-bold ${urgencyLabel?.color || 'text-emerald-500'}`}>
                                  {(fb.urgency * 10).toFixed(0)}/10
                                </p>
                              </div>
                            )}
                            {fb.effortScore !== null && (
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <p className="text-xs text-muted-foreground">{t('dealerAiInsights.effortLabel')}</p>
                                <p className={`text-lg font-bold ${fb.effortScore > 0.7 ? 'text-red-500' : fb.effortScore > 0.4 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                                  {(fb.effortScore * 10).toFixed(0)}/10
                                </p>
                              </div>
                            )}
                            {fb.churnRisk !== null && (
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <p className="text-xs text-muted-foreground">{t('dealerAiInsights.churnRiskLabel')}</p>
                                <p className={`text-lg font-bold ${churnLabel?.color || 'text-emerald-500'}`}>
                                  {(fb.churnRisk * 100).toFixed(0)}%
                                </p>
                              </div>
                            )}
                            {fb.intentScore !== null && (
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <p className="text-xs text-muted-foreground">{t('dealerAiInsights.intentScoreLabel')}</p>
                                <p className="text-lg font-bold text-primary">{(fb.intentScore * 100).toFixed(0)}%</p>
                              </div>
                            )}
                          </div>

                          {fb.topics.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t('dealerAiInsights.topicsLabel')}</p>
                              <div className="flex flex-wrap gap-2">
                                {fb.topics.map((t) => (
                                  <Badge key={t} variant="outline" className="text-xs">{toLocalizedLabel(t, topicLabelMap)}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {fb.statementSentiments.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t('dealerAiInsights.sentenceSentimentTitle')}</p>
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
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t('dealerAiInsights.entitiesDetectedTitle')}</p>
                              <div className="flex flex-wrap gap-2">
                                {fb.entities.map((entity, i) => (
                                  <Badge key={`${entity.name}-${i}`} variant="outline" className="text-xs">
                                    {entity.name} ({entity.type}) {entity.sentiment === 'positive' ? t('dealerAiInsights.sentimentPositive') : entity.sentiment === 'negative' ? t('dealerAiInsights.sentimentNegative') : t('dealerAiInsights.sentimentNeutral')}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {fb.themes.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t('dealerAiInsights.themesLabel')}</p>
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
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t('dealerAiInsights.actionSuggestionsTitle')}</p>
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

                          <div className="text-xs text-muted-foreground flex flex-wrap gap-3 items-center">
                            {fb.aiModelUsed === 'local-fallback' ? (
                              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                                AI yapılandırılmamış — yalnızca yerel ön-analiz (gerçek AI sonucu değil)
                              </span>
                            ) : (
                              <span>{t('dealerAiInsights.aiModelLine')} {fb.aiModelUsed || '-'}</span>
                            )}
                            <span>{t('dealerAiInsights.versionLabel')} {fb.aiVersion || '-'}</span>
                            <span>{t('dealerAiInsights.processedLabel')} {fb.aiProcessedAt ? new Date(fb.aiProcessedAt).toLocaleString(localeTag) : t('dealerAiInsights.pendingProcessing')}</span>
                          </div>
                        </m.div>
                      )}
                    </m.div>
                  );
                })}
              </div>
              {filteredFeedbacks.length > 10 && (
                <Button variant="ghost" className="w-full mt-4" onClick={() => setShowAllFeedbacks(!showAllFeedbacks)}>
                  {showAllFeedbacks ? <><ChevronUp className="h-4 w-4 mr-2" />{t('dealerAiInsights.showLess')}</> : <><ChevronDown className="h-4 w-4 mr-2" />{t('dealerAiInsights.showAllWithCount').replace('{count}', String(filteredFeedbacks.length))}</>}
                </Button>
              )}
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* AI Recommendations */}
      {report?.recommendations && report.recommendations.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="rounded-lg bg-primary p-2 text-primary-foreground">
                <Lightbulb className="h-5 w-5" aria-hidden />
              </div>
              {t('dealerAiInsights.aiRecommendationsTitle')}
            </CardTitle>
            <CardDescription>
              {t('dealerAiInsights.aiRecommendationsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                {visibleRecommendations.map((rec, index) => {
                const priorityConfig = getPriorityConfig(rec.priority);
                  const RecIcon = getCategoryIcon(rec.category);
                return (
                  <m.div
                      key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + index * 0.1 }}
                    className={`p-5 rounded-xl border ${priorityConfig.border} ${priorityConfig.bg}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${priorityConfig.gradient} shrink-0`}>
                        <RecIcon className="h-6 w-6 text-foreground/95 dark:text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-bold text-lg">{rec.text}</h4>
                          <Badge className={`${priorityConfig.bg} ${priorityConfig.color} ${priorityConfig.border} border`}>
                              {priorityConfig.label} {t('dealerAiInsights.priorityWord')}
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
                  </m.div>
                );
              })}
            </div>
            {report.recommendations.length > 5 && (
              <Button
                variant="ghost"
                className="w-full mt-4"
                onClick={() => setShowAllRecommendations(!showAllRecommendations)}
              >
                {showAllRecommendations ? <><ChevronUp className="h-4 w-4 mr-2" />{t('dealerAiInsights.showLess')}</> : <><ChevronDown className="h-4 w-4 mr-2" />{t('dealerAiInsights.loadMoreWithCount').replace('{count}', String(report.recommendations.length))}</>}
              </Button>
            )}
          </CardContent>
        </Card>
      </m.div>
      )}

      {/* AI Prediction */}
      {report?.predictedRating && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <m.div
                  className="rounded-2xl bg-primary p-4 text-primary-foreground"
                  animate={{
                    boxShadow: [
                      '0 0 20px hsl(var(--primary) / 0.25)',
                      '0 0 36px hsl(var(--primary) / 0.35)',
                      '0 0 20px hsl(var(--primary) / 0.25)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Brain className="h-8 w-8" aria-hidden />
                </m.div>
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-bold">
                    <Rocket className="h-5 w-5 text-primary" aria-hidden />
                    {t('dealerAiInsights.aiPredictionTitle')}
                  </h3>
                  <p className="text-muted-foreground">
                    {t('dealerAiInsights.aiPredictionLead')}{' '}
                      <span className="text-emerald-500 font-bold text-xl">{report.predictedRating.toFixed(1)}</span>
                    {t('dealerAiInsights.aiPredictionMid')}
                    {t('dealerAiInsights.aiPredictionTrail')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <m.div
                    key={star}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.9 + star * 0.1 }}
                  >
                    <Star 
                        className={`h-8 w-8 ${star <= Math.floor(report.predictedRating) ? 'text-yellow-500 fill-yellow-500' : star - 0.5 <= report.predictedRating ? 'text-yellow-500 fill-yellow-500/50' : 'text-muted-foreground/30'}`}
                    />
                  </m.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </m.div>
      )}
      <Dialog open={actionAssignOpen} onOpenChange={setActionAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dealerAiInsights.assignDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('dealerAiInsights.assignDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              {pendingAction?.action}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignedToId">{t('dealerAiInsights.labelAssignee')}</Label>
              <select
                id="assignedToId"
                value={assignForm.assignedToId}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, assignedToId: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-foreground shadow-sm dark:border-white/25 dark:bg-white/[0.07]"
              >
                <option value="">{t('dealerAiInsights.unassigned')}</option>
                {staffMembers.map((staff) => (
                  <option key={staff.id} value={staff.userId}>
                    {staff.user.name || staff.user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueAt">{t('dealerAiInsights.labelDueDate')}</Label>
              <Input
                id="dueAt"
                type="date"
                value={assignForm.dueAt}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, dueAt: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionAssignOpen(false)}>
              {t('dealerAiInsights.cancel')}
            </Button>
            <Button
              onClick={async () => {
                if (!pendingAction) return;
                const ok = await handleCreateActionItem(
                  { action: pendingAction.action, priority: pendingAction.priority },
                  pendingAction.key,
                  { assignedToId: assignForm.assignedToId, dueAt: assignForm.dueAt }
                );
                if (ok) {
                  setActionAssignOpen(false);
                  setPendingAction(null);
                }
              }}
              disabled={!!pendingAction && savingActionKey === pendingAction.key}
            >
              {!!pendingAction && savingActionKey === pendingAction.key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('dealerAiInsights.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </LazyMotion>
  );
}
