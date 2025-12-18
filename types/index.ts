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
  isPublic: boolean;
  createdAt: Date;
  user?: PublicUser | null;
}

export interface AIAnalysisResult {
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

