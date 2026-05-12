import {
    Users,
    MessageSquare,
    QrCode,
    TrendingUp,
    Trophy,
    CreditCard,
    Brain,
    BarChart3,
    Gift,
    Settings,
    Search,
    History,
    Key,
    Link2,
    PieChart,
    Layers,
    ToggleLeft,
    SlidersHorizontal,
    MapPin,
    FileText,
    Palette,
    Share2,
    Box,
    Eye,
    Database,
    Cpu,
    Shield,
    Target,
    type LucideIcon,
} from 'lucide-react';
import type { FeatureNavItem, QuickAccessItem } from './types';

// ─── Icon Map ───────────────────────────────────────────────
export const iconMap: Record<string, LucideIcon> = {
    Users,
    MessageSquare,
    QrCode,
    TrendingUp,
    CreditCard,
};

// ─── Refresh Interval ───────────────────────────────────────
export const REFRESH_INTERVAL_MS = 45_000;

// ─── Helper Functions ───────────────────────────────────────
export const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
        case 'positive': return 'success';
        case 'negative': return 'destructive';
        default: return 'secondary';
    }
};

export const getRoleColor = (role: string) => {
    switch (role) {
        case 'ADMIN': return 'destructive';
        case 'DEALER': return 'default';
        default: return 'secondary';
    }
};

export const getRoleLabel = (role: string) => {
    switch (role) {
        case 'ADMIN': return 'Admin';
        case 'DEALER': return 'Bayi';
        default: return 'Müşteri';
    }
};

// ─── Navigation ─────────────────────────────────────────────
export const ANA_OZELLIKLER: FeatureNavItem[] = [
    { href: '/admin/ai-dashboard', label: 'AI Kontrol Merkezi', description: 'Yapay zeka analizleri ve insight merkezi', icon: Brain, color: 'from-primary to-primary/80' },
    { href: '/admin/analytics', label: 'Analitik', description: 'Raporlar, trendler ve performans metrikleri', icon: BarChart3, color: 'from-blue-500 to-cyan-500' },
    { href: '/admin/badges', label: 'Gamification', description: 'Rozetler, görevler ve ödüller', icon: Trophy, color: 'from-amber-500 to-orange-500' },
    { href: '/admin/feedbacks', label: 'Geri Bildirimler & VOC', description: 'Müşteri sesi ve geri bildirim yönetimi', icon: MessageSquare, color: 'from-emerald-500 to-teal-500' },
    { href: '/admin/compliance', label: 'KVKK & Denetim', description: 'Uyumluluk ve denetim günlüğü', icon: Shield, color: 'from-slate-500 to-zinc-600' },
    { href: '/admin/settings', label: 'Ayarlar', description: 'Genel ayarlar ve yapılandırma', icon: Settings, color: 'from-zinc-500 to-slate-600' },
];

export const HIZLI_ERISIM: QuickAccessItem[] = [
    { href: '/admin/users', label: 'Kullanıcılar', icon: Users },
    { href: '/admin/feedbacks', label: 'Geri Bildirimler', icon: MessageSquare },
    { href: '/admin/cards', label: 'Kartlar', icon: CreditCard },
    { href: '/admin/badges', label: 'Rozetler', icon: Trophy },
    { href: '/admin/quests', label: 'Görevler', icon: Target },
    { href: '/admin/rewards', label: 'Ödüller', icon: Gift },
    { href: '/admin/segments', label: 'Segmentler', icon: PieChart },
    { href: '/admin/seo', label: 'SEO Motoru', icon: Search },
    { href: '/admin/pricing', label: 'Fiyatlandırma', icon: Layers },
    { href: '/admin/features', label: 'Özellikler', icon: ToggleLeft },
    { href: '/admin/points-matrix', label: 'Puan Matrisi', icon: SlidersHorizontal },
    { href: '/admin/league-settings', label: 'Lig Ayarları', icon: Trophy },
    { href: '/admin/discovery', label: 'Discovery', icon: MapPin },
    { href: '/admin/audit', label: 'Denetim Günlüğü', icon: History },
    { href: '/admin/webhooks', label: "Webhook'lar", icon: Link2 },
    { href: '/admin/api-keys', label: 'API Anahtarları', icon: Key },
    { href: '/admin/ai-dashboard', label: 'AI Kontrol', icon: Brain },
    { href: '/admin/ai-detailed', label: 'AI Detaylı', icon: Eye },
    { href: '/admin/ai-learning', label: 'AI Öğrenme', icon: Database },
    { href: '/admin/ai-quality', label: 'AI Kalite', icon: Eye },
    { href: '/admin/ai-settings', label: 'AI Ayarları', icon: Cpu },
    { href: '/admin/surprise-boxes', label: 'Sürpriz Kutu', icon: Box },
    { href: '/admin/partners', label: 'Partnerler', icon: Share2 },
    { href: '/admin/themes', label: 'Temalar', icon: Palette },
    { href: '/admin/pages', label: 'Sayfalar', icon: FileText },
    { href: '/admin/compliance', label: 'KVKK & 5651', icon: Shield },
    { href: '/admin/settings', label: 'Ayarlar', icon: Settings },
];
