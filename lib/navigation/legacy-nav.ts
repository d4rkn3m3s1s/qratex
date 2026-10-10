/**
 * ESKİ sidebar dizileri (redesign öncesi menü) — yalnız geriye uyum için.
 *
 * - `/admin/sidebar-order` ve `/admin/menu-groups` (Navigasyon Stüdyosu gelene dek) bu
 *   dizilerle çalışır; kaydettikleri eski kimlikler `resolveRouteId` ile kayıt
 *   kimliğine göç eder.
 * - Test: her eski kimliğin kayıtta çözüldüğünü doğrular (DB'deki sıra/grup ayarı kaybolmaz).
 *
 * YENİ MENÜ BURADAN DEĞİL `lib/navigation/registry.ts`'ten türetilir. Bu dosyaya öğe eklemeyin.
 */
import {
  LayoutDashboard,
  Rocket,
  Mail,
  Inbox,
  QrCode,
  MessageSquare,
  MessageCircle,
  Trophy,
  Gift,
  BarChart3,
  Settings,
  Users,
  Shield,
  Sparkles,
  Ticket,
  Target,
  CreditCard,
  FileText,
  Palette,
  ToggleLeft,
  TrendingUp,
  Heart,
  ScanLine,
  History,
  Package,
  Box,
  Gamepad2,
  CalendarDays,
  Layers,
  Brain,
  Database,
  Cpu,
  Eye,
  Share2,
  Megaphone,
  PieChart,
  SlidersHorizontal,
  FlaskConical,
  MapPin,
  AlertTriangle,
  ClipboardList,
  TrendingDown,
  Bot,
  Compass,
  Search,
  Link2,
  Key,
  Plus,
  Activity,
  ShieldAlert,
  Beaker,
  Globe,
  Users2,
  ShoppingBag,
  Radar,
  BookOpen,
  Star,
  Zap,
  Code,
  LayoutGrid,
  Wallet,
  GitBranch,
  Gauge,
  Sprout,
  LayoutTemplate,
  Accessibility,
  Wand2,
  PartyPopper,
  GripVertical,
} from 'lucide-react';

export interface NavItem {
  key?: string;
  /** Messages path suffix: `sidebarNav.admin|dealer|customer.{labelKey}` */
  labelKey: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  /** `featureVisibility` / MODULE_CATALOG anahtarı — menü `key` ile aynı değilse (ör. nearby → discovery) */
  featureKey?: string;
  /** Küresel `moduleControls` anahtarı — genelde `featureKey` veya modül anahtarı */
  moduleKey?: string;
  /** Ait olduğu grup anahtarı (NAV_GROUPS içindeki bir grup). Yoksa üst düzey öğe. */
  groupKey?: string;
  /** Yalnızca kendisine bir ekip rolü (adminTeamRole) atanmış kullanıcılara görünür. */
  teamOnly?: boolean;
}

/** Katlanabilir sol menü grubu. Sırası ait olduğu ilk öğenin konumuna göredir. */
export interface NavGroup {
  key: string;
  /** `sidebarNavGroups.{customer|dealer}.{key}` */
  labelKey: string;
  icon: React.ElementType;
}

/**
 * Grup katalogları (rol bazlı). Öğeler `groupKey` ile bir gruba bağlanır.
 * Grubu olmayan öğeler üst düzeyde (grupsuz) render edilir.
 * Bu yapı order/visibility sistemini BOZMAZ — gruplama render katmanındadır.
 */
const customerNavGroups: NavGroup[] = [
  { key: 'card', labelKey: 'card', icon: CreditCard },
  { key: 'analytics', labelKey: 'analytics', icon: BarChart3 },
  { key: 'feedback', labelKey: 'feedback', icon: MessageSquare },
  { key: 'trends', labelKey: 'trends', icon: TrendingUp },
  { key: 'rewards', labelKey: 'rewards', icon: Gift },
  { key: 'games', labelKey: 'games', icon: Gamepad2 },
];

const dealerNavGroups: NavGroup[] = [
  { key: 'business', labelKey: 'business', icon: Package },
  { key: 'analytics', labelKey: 'analytics', icon: BarChart3 },
  { key: 'feedback', labelKey: 'feedback', icon: MessageSquare },
  { key: 'system', labelKey: 'system', icon: Cpu },
];

const NAV_GROUPS_BY_ROLE: Record<'admin' | 'dealer' | 'customer', NavGroup[]> = {
  admin: [],
  dealer: dealerNavGroups,
  customer: customerNavGroups,
};

const adminNavItems: NavItem[] = [
  { key: 'dashboard', labelKey: 'dashboard', href: '/admin', icon: LayoutDashboard },
  { key: 'ecosystem', labelKey: 'ecosystem', href: '/admin/ecosystem', icon: LayoutGrid },
  { key: 'platform_pulse', labelKey: 'platform_pulse', href: '/admin/platform-pulse', icon: Activity },
  { key: 'roadmap', labelKey: 'roadmap', href: '/admin/roadmap', icon: GitBranch },
  { labelKey: 'cards', href: '/admin/cards', icon: CreditCard },
  { labelKey: 'users', href: '/admin/users', icon: Users },
  { labelKey: 'feedbacks', href: '/admin/feedbacks', icon: MessageSquare },
  { labelKey: 'badges', href: '/admin/badges', icon: Trophy },
  { labelKey: 'quests', href: '/admin/quests', icon: Target },
  { labelKey: 'rewards', href: '/admin/rewards', icon: Gift },
  { labelKey: 'coupons', href: '/admin/coupons', icon: Ticket },
  { labelKey: 'seasonal_campaigns', href: '/admin/seasonal-campaigns', icon: Sparkles },
  { labelKey: 'seasonal_concepts', href: '/admin/seasonal-concepts', icon: CalendarDays },
  { labelKey: 'surprise_send', href: '/admin/surprise-boxes', icon: Box },
  { labelKey: 'global_benchmarks', href: '/admin/insights', icon: Globe },
  { labelKey: 'donations', href: '/admin/donations', icon: Heart },
  { labelKey: 'referrals', href: '/admin/referrals', icon: Share2 },
  { labelKey: 'squads', href: '/admin/squads', icon: Users2 },
  { labelKey: 'fraud_prevention', href: '/admin/fraud-prevention', icon: ShieldAlert },
  { labelKey: 'trust_command', href: '/admin/trust-command', icon: Shield },
  { labelKey: 'economy_sim', href: '/admin/economy-sim', icon: Activity },
  { labelKey: 'dealers_health', href: '/admin/dealers-health', icon: Heart },
  { labelKey: 'innovation_platform', href: '/admin/innovation', icon: Radar },
  { labelKey: 'segment_proposals', href: '/admin/innovation/segment-proposals', icon: Users2 },
  { labelKey: 'ab_testing', href: '/admin/ab-testing', icon: Beaker },
  { labelKey: 'analytics', href: '/admin/analytics', icon: BarChart3 },
  { labelKey: 'segments', href: '/admin/segments', icon: PieChart },
  { labelKey: 'playbooks', href: '/admin/playbooks', icon: BookOpen },
  { labelKey: 'ai_control', href: '/admin/ai-dashboard', icon: Brain },
  { labelKey: 'grok_council', href: '/admin/agent-council', icon: Bot },
  { labelKey: 'ai_detailed', href: '/admin/ai-detailed', icon: Eye },
  { labelKey: 'ai_learning', href: '/admin/ai-learning', icon: Database },
  { labelKey: 'ai_quality', href: '/admin/ai-quality', icon: Eye },
  { labelKey: 'ai_settings', href: '/admin/ai-settings', icon: Cpu },
  { labelKey: 'qra_chat_logs', href: '/admin/qra-chat-logs', icon: MessageCircle },
  { labelKey: 'pricing', href: '/admin/pricing', icon: Layers },
  { labelKey: 'partners', href: '/admin/partners', icon: Share2 },
  { labelKey: 'pages', href: '/admin/pages', icon: FileText },
  { labelKey: 'themes', href: '/admin/themes', icon: Palette },
  { labelKey: 'avatar_shop', href: '/admin/shop', icon: ShoppingBag },
  { labelKey: 'design_language', href: '/admin/design-language', icon: LayoutTemplate },
  { labelKey: 'menu_order', href: '/admin/sidebar-order', icon: GripVertical },
  { labelKey: 'menu_groups', href: '/admin/menu-groups', icon: LayoutTemplate },
  // Ekip Yönetimi: ADMIN buradan, ekip üyeleri /customer/ekip'ten (aynı paylaşılan bileşen).
  { key: 'team', labelKey: 'team', href: '/admin/ekip', icon: Users2 },
  { labelKey: 'experience_pulse', href: '/admin/experience-pulse', icon: Wand2 },
  { labelKey: 'accessibility', href: '/admin/accessibility', icon: Accessibility },
  { labelKey: 'features', href: '/admin/features', icon: ToggleLeft },
  { labelKey: 'compliance', href: '/admin/compliance', icon: Shield },
  { labelKey: 'privacy_requests', href: '/admin/privacy-requests', icon: Shield },
  { labelKey: 'points_matrix', href: '/admin/points-matrix', icon: SlidersHorizontal },
  { labelKey: 'character_thresholds', href: '/admin/character-thresholds', icon: SlidersHorizontal },
  { labelKey: 'character_test', href: '/admin/character-test', icon: FlaskConical },
  { labelKey: 'gate_settings', href: '/admin/gate-settings', icon: Rocket },
  { labelKey: 'intern_emails', href: '/admin/intern-emails', icon: Mail },
  { labelKey: 'inbox', href: '/admin/inbox', icon: Inbox },
  { labelKey: 'league_settings', href: '/admin/league-settings', icon: Trophy },
  { labelKey: 'mini_games', href: '/admin/games', icon: Gamepad2 },
  { labelKey: 'gamification_settings', href: '/admin/gamification-settings', icon: Zap },
  { labelKey: 'discovery', href: '/admin/discovery', icon: MapPin },
  { labelKey: 'seo', href: '/admin/seo', icon: Search },
  { labelKey: 'audit', href: '/admin/audit', icon: History },
  { labelKey: 'webhooks', href: '/admin/webhooks', icon: Link2 },
  { labelKey: 'api_keys', href: '/admin/api-keys', icon: Key },
  { labelKey: 'admin_api_catalog', href: '/admin/api-catalog', icon: Code },
  { labelKey: 'modules', href: '/admin/modules', icon: Layers },
  { labelKey: 'tech_add', href: '/admin/tech/add', icon: Plus },
  { labelKey: 'observability', href: '/admin/observability', icon: Activity },
  { key: 'settings', labelKey: 'settings', href: '/admin/settings', icon: Settings },
];

// Bayi menüsü — 6 üst düzey blok (raporlanan yapı). `discover` (Keşfet), `ask_analytics`
// (Veriye Sor → AI sohbete birleşir), `action_items` (Aksiyonlar), `operations_brief`
// menüden çıkarıldı. Onboarding (Kurulum) en başta. Abonelik/faturalama → Sistem sonu.
const dealerNavItems: NavItem[] = [
  // 1) Dashboard + Kurulum (grupsuz, en üst)
  { key: 'dashboard', labelKey: 'dashboard', href: '/dealer', icon: LayoutDashboard },
  { key: 'onboarding', labelKey: 'onboarding', href: '/dealer/onboarding', icon: Rocket },
  // 2) İşletme
  { key: 'products', labelKey: 'products', href: '/dealer/products', icon: Package, groupKey: 'business' },
  { key: 'qr_codes', labelKey: 'qr_codes', href: '/dealer/qr-codes', icon: QrCode, groupKey: 'business' },
  { key: 'scan', labelKey: 'scan_card', href: '/dealer/scan', icon: ScanLine, groupKey: 'business' },
  { key: 'campaigns', labelKey: 'campaigns', href: '/dealer/campaigns', icon: Megaphone, groupKey: 'business' },
  { key: 'innovation_hub', labelKey: 'innovation_hub', href: '/dealer/innovation', icon: Sparkles, featureKey: 'dealer_innovation', moduleKey: 'dealer_innovation', groupKey: 'business' },
  { key: 'team', labelKey: 'team', href: '/dealer/team', icon: Users, featureKey: 'staff_management', moduleKey: 'staff_management', groupKey: 'business' },
  { key: 'customers', labelKey: 'customers', href: '/dealer/customers', icon: Users, groupKey: 'business' },
  // 3) Analitik (Büyüme Merkezi)
  { key: 'analytics', labelKey: 'analytics', href: '/dealer/analytics', icon: BarChart3, groupKey: 'analytics' },
  { key: 'growth_hub', labelKey: 'growth_hub', href: '/dealer/growth-hub', icon: Sprout, groupKey: 'analytics' },
  { key: 'churn_risk', labelKey: 'churn_risk', href: '/dealer/churn-risk', icon: TrendingDown, groupKey: 'analytics' },
  { key: 'segment_actions', labelKey: 'segment_actions', href: '/dealer/segment-actions', icon: Target, groupKey: 'analytics' },
  { key: 'roi', labelKey: 'roi', href: '/dealer/roi', icon: PieChart, groupKey: 'analytics' },
  { key: 'benchmark', labelKey: 'benchmark', href: '/dealer/benchmark', icon: BarChart3, groupKey: 'analytics' },
  { key: 'business_outcomes', labelKey: 'business_outcomes', href: '/dealer/business-outcomes', icon: Target, groupKey: 'analytics' },
  // 4) Geri bildirimlerim
  { key: 'feedbacks', labelKey: 'feedbacks', href: '/dealer/feedbacks', icon: MessageSquare, groupKey: 'feedback' },
  { key: 'reviews', labelKey: 'reviews', href: '/dealer/reviews', icon: Star, groupKey: 'feedback' },
  { key: 'remedy_queue', labelKey: 'remedy_queue', href: '/dealer/remedy-queue', icon: ClipboardList, featureKey: 'remedy_offers', moduleKey: 'remedy_offers', groupKey: 'feedback' },
  { key: 'remedy_automation', labelKey: 'remedy_automation', href: '/dealer/remedy-automation', icon: Zap, featureKey: 'remedy_offers', moduleKey: 'remedy_offers', groupKey: 'feedback' },
  { key: 'consumptions', labelKey: 'consumptions', href: '/dealer/consumptions', icon: History, groupKey: 'feedback' },
  { key: 'surveys', labelKey: 'surveys', href: '/dealer/surveys', icon: FileText, featureKey: 'dealer_surveys', moduleKey: 'dealer_surveys', groupKey: 'feedback' },
  // 5) Sistem
  { key: 'incidents', labelKey: 'incidents', href: '/dealer/incidents', icon: AlertTriangle, groupKey: 'system' },
  { key: 'ai_chat', labelKey: 'ai_chat', href: '/dealer/ai-chat', icon: MessageCircle, featureKey: 'ai_features', moduleKey: 'ai_features', groupKey: 'system' },
  { key: 'copilot', labelKey: 'copilot', href: '/dealer/copilot', icon: Bot, groupKey: 'system' },
  { key: 'voc_wall', labelKey: 'voc_wall', href: '/dealer/voc-wall', icon: MessageSquare, groupKey: 'system' },
  { key: 'ai_insights', labelKey: 'ai_insights', href: '/dealer/ai-insights', icon: Sparkles, featureKey: 'ai_features', moduleKey: 'ai_features', groupKey: 'system' },
  { key: 'radar', labelKey: 'radar', href: '/dealer/radar', icon: Radar, groupKey: 'system' },
  { key: 'heatmap', labelKey: 'heatmap', href: '/dealer/heatmap', icon: MapPin, groupKey: 'system' },
  { key: 'ai_settings', labelKey: 'ai_settings', href: '/dealer/ai-settings', icon: Brain, featureKey: 'ai_features', moduleKey: 'ai_features', groupKey: 'system' },
  { key: 'billing', labelKey: 'billing', href: '/dealer/billing', icon: CreditCard, groupKey: 'system' },
  // 6) Ayarlar (grupsuz, en alt)
  { key: 'settings', labelKey: 'settings', href: '/dealer/settings', icon: Settings },
];

// Müşteri menüsü — 9 üst düzey blok (raporlanan yapı). Sıra bu dizideki sıradır;
// gruba ait öğeler grup başlığı altında toplanır. `experiences` ve `discover` (Keşfet)
// menüden çıkarıldı (rapor kararı: Keşfet → chat bot; deneyimler menüde değil).
const customerNavItems: NavItem[] = [
  // 1) Dashboard (grupsuz)
  { key: 'dashboard', labelKey: 'dashboard', href: '/customer', icon: LayoutDashboard },
  // Ekip Yönetimi — yalnızca ekip rolü atanmış kullanıcılara görünür (grupsuz, üst düzey)
  { key: 'team', labelKey: 'team', href: '/customer/ekip', icon: Users2, teamOnly: true },
  // 2) Kartım
  { key: 'my_card', labelKey: 'my_card', href: '/customer/my-card', icon: CreditCard, groupKey: 'card' },
  { key: 'consumptions', labelKey: 'consumptions', href: '/customer/consumptions', icon: History, groupKey: 'card' },
  { key: 'spending_overview', labelKey: 'spending_overview', href: '/customer/spending-overview', icon: Wallet, groupKey: 'card' },
  // 3) Analizler
  { key: 'ai_insights', labelKey: 'ai_insights', href: '/customer/ai-insights', icon: Sparkles, featureKey: 'customer_ai_insights', moduleKey: 'customer_ai_insights', groupKey: 'analytics' },
  { key: 'progress_hub', labelKey: 'progress_hub', href: '/customer/progress-hub', icon: Gauge, groupKey: 'analytics' },
  { key: 'journey_score', labelKey: 'journey_score', href: '/customer/journey-score', icon: Compass, groupKey: 'analytics' },
  { key: 'analytics', labelKey: 'analytics', href: '/customer/analytics', icon: BarChart3, groupKey: 'analytics' },
  { key: 'my_year', labelKey: 'my_year', href: '/customer/my-year', icon: Sparkles, groupKey: 'analytics' },
  // 4) Geri bildirimlerim
  { key: 'feedbacks', labelKey: 'feedbacks', href: '/customer/feedbacks', icon: MessageSquare, groupKey: 'feedback' },
  { key: 'remedy', labelKey: 'remedy', href: '/customer/remedy', icon: Gift, groupKey: 'feedback' },
  // 5) Trend Analiz
  { key: 'trends', labelKey: 'trends', href: '/customer/trends', icon: TrendingUp, groupKey: 'trends' },
  { key: 'category_leaderboard', labelKey: 'category_leaderboard', href: '/customer/category-leaderboard', icon: Trophy, groupKey: 'trends' },
  { key: 'campaigns', labelKey: 'campaigns', href: '/customer/campaigns', icon: Megaphone, featureKey: 'customer_campaigns', moduleKey: 'customer_campaigns', groupKey: 'trends' },
  // 6) Yakınımdakiler (grupsuz)
  { key: 'nearby', labelKey: 'nearby', href: '/customer/nearby', icon: MapPin, featureKey: 'discovery', moduleKey: 'discovery' },
  // 7) Ödüller & Mağaza
  { key: 'badges', labelKey: 'badges', href: '/customer/badges', icon: Trophy, groupKey: 'rewards' },
  { key: 'shop', labelKey: 'shop', href: '/customer/shop', icon: ShoppingBag, groupKey: 'rewards' },
  { key: 'quests', labelKey: 'quests', href: '/customer/quests', icon: Target, groupKey: 'rewards' },
  { key: 'surprise_boxes', labelKey: 'surprise_boxes', href: '/customer/surprise-boxes', icon: Box, groupKey: 'rewards' },
  { key: 'referral', labelKey: 'referral', href: '/customer/referral', icon: Share2, groupKey: 'rewards' },
  { key: 'rewards', labelKey: 'rewards', href: '/customer/rewards', icon: Gift, groupKey: 'rewards' },
  { key: 'donations', labelKey: 'donations', href: '/customer/donations', icon: Heart, groupKey: 'rewards' },
  // 8) QGameX
  { key: 'games_hub', labelKey: 'games_hub', href: '/customer/games', icon: Gamepad2, groupKey: 'games' },
  { key: 'event_center', labelKey: 'event_center', href: '/customer/event', icon: PartyPopper, groupKey: 'games' },
  { key: 'squads', labelKey: 'squads', href: '/customer/squads', icon: Users2, groupKey: 'games' },
  { key: 'leaderboard', labelKey: 'leaderboard', href: '/customer/leaderboard', icon: Trophy, groupKey: 'games' },
  // 9) Ayarlar (grupsuz)
  { key: 'settings', labelKey: 'settings', href: '/customer/settings', icon: Settings },
];


export function getNavOrderId(item: NavItem): string {
  return item.key ?? item.href;
}

/** Rol bazlı (eski) grup kataloğunu döndürür (eski admin grup düzenleyici için). */
export function getNavGroups(role: 'admin' | 'dealer' | 'customer'): NavGroup[] {
  return NAV_GROUPS_BY_ROLE[role];
}

export { adminNavItems, dealerNavItems, customerNavItems };
