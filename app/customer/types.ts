export interface Quest {
    id: string;
    name: string;
    description: string;
    icon: string;
    progress: number;
    target: number;
    reward: { points: number; xp: number };
    type: string;
}

export interface BadgeData {
    id: string;
    name: string;
    icon: string;
    rarity: string;
    earnedAt: string;
}

export interface FeedbackData {
    id: string;
    business: string;
    rating: number;
    points: number;
    createdAt: string;
}

export interface ActivityItem {
    id: string;
    business: string;
    rating?: number;
    points?: number;
    product?: string;
    hasReview?: boolean;
    createdAt: string;
    type: string;
}

export interface LeaderboardEntry {
    rank: number;
    name: string;
    points: number;
    level: number;
    avatar?: string | null;
    image?: string | null;
    isCurrentUser?: boolean;
}

export interface Reward {
    id: string;
    name: string;
    icon: string;
    cost: number;
}

export interface FavoriteDealer {
    dealerId: string;
    businessName: string | null;
    addedAt: string;
}

export interface DiscoverySnapshot {
    trendingVenues: Array<{
        dealerId: string;
        businessName: string;
        score: number;
        avgRating: number;
        feedbackCount: number;
    }>;
    weeklyBest: Array<{
        key: string;
        label: string;
        winner: { businessName: string; score: number } | null;
    }>;
    sponsored: Array<{
        id: string;
        title: string;
        description?: string;
        discountRate?: number;
    }>;
    favoriteDealerIds?: string[];
}

export function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın';
    if (h < 18) return 'İyi günler';
    return 'İyi akşamlar';
}
