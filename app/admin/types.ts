import type { LucideIcon } from 'lucide-react';

// ─── Dashboard Data ─────────────────────────────────────────
export interface DashboardStats {
    title: string;
    value: number | string;
    change: number;
    icon: string;
    iconColor: string;
    iconBgColor: string;
}

export interface RecentUser {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: 'ADMIN' | 'DEALER' | 'CUSTOMER';
    createdAt: string;
}

export interface RecentFeedback {
    id: string;
    text: string;
    rating: number;
    sentiment: string;
    createdAt: string;
    userName: string;
    businessName: string;
    productName?: string;
    type?: string;
}

export interface TopDealer {
    id: string;
    name: string;
    feedbacks: number;
    rating: number;
}

export interface DashboardData {
    stats: DashboardStats[];
    recentUsers: RecentUser[];
    recentFeedbacks: RecentFeedback[];
    topDealers: TopDealer[];
    sentiment: { positive: number; neutral: number; negative: number };
    totals: {
        users: number;
        feedbacks: number;
        qrCodes: number;
        activeQRCodes: number;
        scans: number;
    };
}

// ─── Analytics ──────────────────────────────────────────────
export type AnalyticsData = {
    totalUsers: number;
    totalFeedbacks: number;
    userGrowth: number;
    feedbackGrowth: number;
    avgRating: number;
    comparison: {
        users: { current: number; previous: number; change: number };
        feedbacks: { current: number; previous: number; change: number };
        rating: { current: string; previous: string; change: number };
    };
    ratingDistribution: Record<number, number>;
    dailyData: {
        date: string;
        label: string;
        feedbacks: number;
        avgRating: number;
        positive: number;
        negative: number;
        neutral: number;
    }[];
    roleDistribution: Record<string, number>;
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
};

// ─── AI ─────────────────────────────────────────────────────
export type AiStats = {
    analyzedCount: number;
    urgentCount: number;
    toxicCount: number;
    churnCount: number;
    intentDist: Record<string, number>;
    recentAnalyses: {
        feedbackId: string;
        text: string;
        sentiment: string;
        intent: string;
        urgency: number;
        dealerName: string;
        createdAt: string;
    }[];
};

// ─── Cards ──────────────────────────────────────────────────
export type CardStats = {
    UNUSED: number;
    ACTIVATED: number;
    BLOCKED: number;
    total: number;
};

// ─── Tech ───────────────────────────────────────────────────
export type TechSummary = {
    features: { total: number; enabled: number; disabled: number };
    webhooks: { total: number; active: number };
    apiKeys: { total: number };
};

// ─── System Status ──────────────────────────────────────────
export type SystemStatus = {
    status: 'healthy' | 'degraded' | 'error';
    timestamp: string;
    checks: Record<string, { status: string; latencyMs?: number; message?: string }>;
    environment: { label: string; nodeEnv: string; isVercel: boolean; vercelEnv: string | null; region: string | null };
    dbLatencyMs: number | null;
};

// ─── Settings ───────────────────────────────────────────────
export type SettingsSummary = { categoriesCount: number; keysCount: number };

// ─── Compliance ─────────────────────────────────────────────
export type ComplianceOverview = {
    summary: {
        totalUsers: number;
        totalFeedbacks: number;
        totalConsumptions: number;
        unresolvedSuspicious: number;
        activeSuspiciousLast30d: number;
    };
    logging: {
        auditCoverage: { totalAuditLogs: number; withIpPercent: number; withUserAgentPercent: number };
        cardAuditCoverage: { totalCardAuditLogs: number; withIpPercent: number };
    };
};

// ─── Audit ──────────────────────────────────────────────────
export type AuditEntry = {
    id: string;
    entity: string;
    action: string;
    createdAt: string;
    user?: { name: string | null; email: string; role: string };
};

// ─── Segment ────────────────────────────────────────────────
export type SegmentSummary = {
    id: string;
    name: string;
    color: string;
    icon: string;
    count: number;
}[];

// ─── Nav Items ──────────────────────────────────────────────
export type FeatureNavItem = {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
    color: string;
};

export type QuickAccessItem = {
    href: string;
    label: string;
    icon: LucideIcon;
};

// ─── Timeline ───────────────────────────────────────────────
export type TimelineItem = {
    id: string;
    type: 'user' | 'feedback';
    time: string;
    user?: RecentUser;
    feedback?: RecentFeedback;
};
