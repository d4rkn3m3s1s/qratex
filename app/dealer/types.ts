export interface DealerStats {
    stats: {
        totalFeedbacks: number;
        avgRating: string;
        totalQRCodes: number;
        activeQRCodes: number;
        totalScans: number;
        feedbackGrowth: number;
        ratingChange: number;
        weeklyFeedbacks: number;
        conversionRate: string;
        actionCompletionRate?: number;
        actionItemsTotal?: number;
        actionItemsDone?: number;
    };
    performance: { score: number; level: string; color: string };
    sentimentData: { positive: number; neutral: number; negative: number };
    weeklyData: Array<{ day: string; feedbacks: number; avgRating: number }>;
    previousWeekData?: Array<{ day: string; feedbacks: number; avgRating: number }>;
    previousWeekFeedbacks?: number;
    consumptionStats?: { total: number; customers: number; reviewed: number; pending: number };
    recentFeedbacks: Array<{
        id: string;
        rating: number;
        text: string | null;
        sentiment: string | null;
        createdAt: string;
        qrName: string;
        userName: string;
        userImage: string | null;
    }>;
    qrCodes: Array<{
        id: string;
        name: string;
        code: string;
        scans: number;
        feedbacks: number;
        avgRating: string;
        isActive: boolean;
    }>;
}
