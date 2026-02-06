import { Role } from '@prisma/client';

// ─────────────────────────────────────────────────────────────
// USER TYPES
// ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
  points: number;
  level: number;
  xp: number;
  businessName?: string | null;
  businessLogo?: string | null;
  businessDesc?: string | null;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  name: string | null;
  image: string | null;
  level: number;
  points: number;
}

// ─────────────────────────────────────────────────────────────
// GAMIFICATION TYPES
// ─────────────────────────────────────────────────────────────

export interface BadgeRequirement {
  type: string;
  value: number | boolean;
}

export interface QuestRequirement {
  type: string;
  count: number;
}

export interface QuestReward {
  points: number;
  xp: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  requirement: BadgeRequirement;
  isActive: boolean;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'daily' | 'weekly' | 'special';
  requirement: QuestRequirement;
  reward: QuestReward;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  type: 'digital' | 'physical' | 'coupon';
  stock: number;
  isActive: boolean;
}

export interface UserProgress {
  points: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  badges: Badge[];
  activeQuests: QuestWithProgress[];
  rank?: number;
}

export interface QuestWithProgress extends Quest {
  progress: number;
  completedAt: Date | null;
}

export interface LeaderboardEntry {
  rank: number;
  user: PublicUser;
  points: number;
  level: number;
}

// ─────────────────────────────────────────────────────────────
// FEEDBACK TYPES
// ─────────────────────────────────────────────────────────────

export interface QRCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dealerId: string;
  isActive: boolean;
  scanCount: number;
  createdAt: Date;
}

export interface FeedbackInput {
  qrCodeId: string;
  rating: number;
  text?: string;
  media?: string[];
}

export interface Feedback {
  id: string;
  qrCodeId: string;
  userId: string | null;
  rating: number;
  text: string | null;
  media: string[] | null;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  emotions: Record<string, number> | null;
  topics: string[] | null;
  isToxic: boolean;
  aiAnalysis: AIAnalysisResult | null;
  // Experience Signals
  intent?: string | null;
  intentScore?: number | null;
  urgency?: number | null;
  effortScore?: number | null;
  churnRisk?: number | null;
  // Advanced NLP
  entities?: AIEntity[] | null;
  themes?: AITheme[] | null;
  statementSentiments?: AIStatementSentiment[] | null;
  actionSuggestions?: AIActionSuggestion[] | null;
  // AI Meta
  aiProcessedAt?: Date | null;
  aiModelUsed?: string | null;
  aiVersion?: string | null;
  isPublic: boolean;
  createdAt: Date;
  user?: PublicUser | null;
}

export interface AIAnalysisResult {
  // Core Sentiment
  sentiment: {
    label: 'positive' | 'negative' | 'neutral';
    score: number;
  };
  emotions: {
    label: string;
    score: number;
  }[];
  topics: string[];
  toxicity: {
    isToxic: boolean;
    score: number;
    categories: string[];
  };
  summary?: string;

  // Experience Signals
  intent?: {
    label: 'complaint' | 'suggestion' | 'praise' | 'question' | 'general';
    score: number;
  };
  urgency?: number; // 0-1
  effortScore?: number; // 0-1 customer effort
  churnRisk?: number; // 0-1

  // Advanced NLP
  entities?: AIEntity[];
  themes?: AITheme[];
  statementSentiments?: AIStatementSentiment[];
  actionSuggestions?: AIActionSuggestion[];

  // Meta
  modelUsed?: string;
  version?: string;
}

export interface AIEntity {
  type: 'product' | 'person' | 'location' | 'service' | 'facility' | 'brand' | 'other';
  name: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface AITheme {
  theme: string;
  subTheme?: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number;
}

export interface AIStatementSentiment {
  statement: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
}

export interface AIActionSuggestion {
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact?: string;
  category?: string;
}

// AI Insight Report Types
export interface AIInsightReportData {
  overallScore: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
  totalFeedbacks: number;
  summary: string;
  strengths: AIInsightItem[];
  weaknesses: AIInsightItem[];
  recommendations: AIRecommendation[];
  alerts: AIAlert[];
  keyDrivers: AIKeyDriver[];
  predictedRating?: number;
  keyMetrics: AIKeyMetrics;
}

export interface AIInsightItem {
  title: string;
  score: number;
  description: string;
  icon?: string;
}

export interface AIRecommendation {
  text: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  category: string;
}

export interface AIAlert {
  type: 'toxic' | 'urgent' | 'churn' | 'trend' | 'anomaly';
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  feedbackId?: string;
}

export interface AIKeyDriver {
  factor: string;
  impact: number; // -1 to 1
  correlation: number;
  direction: 'positive' | 'negative';
}

export interface AIKeyMetrics {
  responseRate: number;
  avgRating: number;
  nps: number;
  csat: number;
  ces: number; // Customer Effort Score
}

// AI Theme Cluster
export interface AIThemeClusterData {
  theme: string;
  subTheme?: string;
  sentiment: string;
  count: number;
  avgScore: number;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  keywords?: string[];
  sampleTexts?: string[];
}

// AI Settings
export interface AISettingsData {
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
  customPrompt?: string;
}

// AI Conversation
export interface AIConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface FeedbackStats {
  totalCount: number;
  averageRating: number;
  sentimentDistribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
  ratingDistribution: {
    [key: number]: number;
  };
  topTopics: { topic: string; count: number }[];
  recentTrend: 'up' | 'down' | 'stable';
}

// ─────────────────────────────────────────────────────────────
// SETTINGS TYPES
// ─────────────────────────────────────────────────────────────

export interface MenuItem {
  label: string;
  href: string;
  icon?: string;
}

export interface HeaderConfig {
  logo: string;
  menuItems: MenuItem[];
  ctaButton: {
    label: string;
    href: string;
  };
}

export interface FooterColumn {
  title: string;
  links: MenuItem[];
}

export interface SocialLink {
  platform: string;
  href: string;
}

export interface FooterConfig {
  columns: FooterColumn[];
  socialLinks: SocialLink[];
  legalText: string;
}

export interface GamificationConfig {
  pointsPerFeedback: number;
  pointsPerDetailedFeedback: number;
  xpPerLevel: number;
  levelMultiplier: number;
  leagues: string[];
}

export interface AIConfig {
  enabled: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
  sentimentAnalysis: boolean;
  emotionDetection: boolean;
  topicExtraction: boolean;
  toxicityCheck: boolean;
  intentAnalysis: boolean;
  urgencyDetection: boolean;
  entityRecognition: boolean;
  churnPrediction: boolean;
  themeDiscovery: boolean;
  autoAnalyze: boolean;
}

// ─────────────────────────────────────────────────────────────
// API TYPES
// ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATION TYPES
// ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS TYPES
// ─────────────────────────────────────────────────────────────

export interface AnalyticsPeriod {
  start: Date;
  end: Date;
  label: string;
}

export interface AnalyticsData {
  period: AnalyticsPeriod;
  feedbackCount: number;
  averageRating: number;
  sentimentScore: number;
  topTopics: string[];
  trend: number; // Percentage change
}

export interface DashboardStats {
  totalFeedbacks: number;
  averageRating: number;
  activeFeedbackers: number;
  topPerformingQR: QRCode | null;
  recentFeedbacks: Feedback[];
  chartData: {
    date: string;
    count: number;
    rating: number;
  }[];
}

// ─────────────────────────────────────────────────────────────
// FILE UPLOAD TYPES
// ─────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
  thumbnail?: string;
}

export interface SignedUploadUrl {
  uploadUrl: string;
  fileUrl: string;
  fields?: Record<string, string>;
}

