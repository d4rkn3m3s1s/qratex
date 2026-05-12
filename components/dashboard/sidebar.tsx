'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  QrCode,
  MessageSquare,
  MessageCircle,
  Trophy,
  Gift,
  BarChart3,
  Settings,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Shield,
  Sparkles,
  Crown,
  Target,
  Store,
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
  Layers,
  Brain,
  Database,
  Cpu,
  Eye,
  Share2,
  Megaphone,
  PieChart,
  SlidersHorizontal,
  MapPin,
  AlertTriangle,
  ListChecks,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn, getInitials, calculateLevelProgress } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

interface NavItem {
  key?: string;
  /** Messages path suffix: `sidebarNav.admin|dealer|customer.{labelKey}` */
  labelKey: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

interface SidebarProps {
  role: 'ADMIN' | 'DEALER' | 'CUSTOMER';
  /** Admin SEO’dan gelen site adı; yoksa "QRATEX" kullanılır */
  siteName?: string;
}

const adminNavItems: NavItem[] = [
  { key: 'dashboard', labelKey: 'dashboard', href: '/admin', icon: LayoutDashboard },
  { labelKey: 'cards', href: '/admin/cards', icon: CreditCard },
  { labelKey: 'users', href: '/admin/users', icon: Users },
  { labelKey: 'feedbacks', href: '/admin/feedbacks', icon: MessageSquare },
  { labelKey: 'badges', href: '/admin/badges', icon: Trophy },
  { labelKey: 'quests', href: '/admin/quests', icon: Target },
  { labelKey: 'rewards', href: '/admin/rewards', icon: Gift },
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
  { labelKey: 'features', href: '/admin/features', icon: ToggleLeft },
  { labelKey: 'compliance', href: '/admin/compliance', icon: Shield },
  { labelKey: 'points_matrix', href: '/admin/points-matrix', icon: SlidersHorizontal },
  { labelKey: 'league_settings', href: '/admin/league-settings', icon: Trophy },
  { labelKey: 'discovery', href: '/admin/discovery', icon: MapPin },
  { labelKey: 'seo', href: '/admin/seo', icon: Search },
  { labelKey: 'audit', href: '/admin/audit', icon: History },
  { labelKey: 'webhooks', href: '/admin/webhooks', icon: Link2 },
  { labelKey: 'api_keys', href: '/admin/api-keys', icon: Key },
  { labelKey: 'modules', href: '/admin/modules', icon: Layers },
  { labelKey: 'tech_add', href: '/admin/tech/add', icon: Plus },
  { labelKey: 'observability', href: '/admin/observability', icon: Activity },
  { key: 'settings', labelKey: 'settings', href: '/admin/settings', icon: Settings },
];

const dealerNavItems: NavItem[] = [
  { key: 'dashboard', labelKey: 'dashboard', href: '/dealer', icon: LayoutDashboard },
  { key: 'business_outcomes', labelKey: 'business_outcomes', href: '/dealer/business-outcomes', icon: Target },
  { key: 'scan', labelKey: 'scan_card', href: '/dealer/scan', icon: ScanLine },
  { key: 'products', labelKey: 'products', href: '/dealer/products', icon: Package },
  { key: 'qr_codes', labelKey: 'qr_codes', href: '/dealer/qr-codes', icon: QrCode },
  { key: 'consumptions', labelKey: 'consumptions', href: '/dealer/consumptions', icon: History },
  { key: 'feedbacks', labelKey: 'feedbacks', href: '/dealer/feedbacks', icon: MessageSquare },
  { key: 'reviews', labelKey: 'reviews', href: '/dealer/reviews', icon: Star },
  { key: 'remedy_queue', labelKey: 'remedy_queue', href: '/dealer/remedy-queue', icon: ClipboardList },
  { key: 'remedy_automation', labelKey: 'remedy_automation', href: '/dealer/remedy-automation', icon: Zap },
  { key: 'analytics', labelKey: 'analytics', href: '/dealer/analytics', icon: BarChart3 },
  { key: 'campaigns', labelKey: 'campaigns', href: '/dealer/campaigns', icon: Megaphone },
  { key: 'innovation_hub', labelKey: 'innovation_hub', href: '/dealer/innovation', icon: Sparkles },
  { key: 'surveys', labelKey: 'surveys', href: '/dealer/surveys', icon: FileText },
  { key: 'incidents', labelKey: 'incidents', href: '/dealer/incidents', icon: AlertTriangle },
  { key: 'action_items', labelKey: 'action_items', href: '/dealer/action-items', icon: ListChecks },
  { key: 'churn_risk', labelKey: 'churn_risk', href: '/dealer/churn-risk', icon: TrendingDown },
  { key: 'roi', labelKey: 'roi', href: '/dealer/roi', icon: PieChart },
  { key: 'benchmark', labelKey: 'benchmark', href: '/dealer/benchmark', icon: BarChart3 },
  { key: 'copilot', labelKey: 'copilot', href: '/dealer/copilot', icon: Bot },
  { key: 'ai_chat', labelKey: 'ai_chat', href: '/dealer/ai-chat', icon: MessageCircle },
  { key: 'voc_wall', labelKey: 'voc_wall', href: '/dealer/voc-wall', icon: MessageSquare },
  { key: 'heatmap', labelKey: 'heatmap', href: '/dealer/heatmap', icon: MapPin },
  { key: 'radar', labelKey: 'radar', href: '/dealer/radar', icon: Radar },
  { key: 'ai_insights', labelKey: 'ai_insights', href: '/dealer/ai-insights', icon: Sparkles },
  { key: 'ai_settings', labelKey: 'ai_settings', href: '/dealer/ai-settings', icon: Brain },
  { key: 'team', labelKey: 'team', href: '/dealer/team', icon: Users },
  { key: 'settings', labelKey: 'settings', href: '/dealer/settings', icon: Settings },
];

const customerNavItems: NavItem[] = [
  { key: 'dashboard', labelKey: 'dashboard', href: '/customer', icon: LayoutDashboard },
  { key: 'my_card', labelKey: 'my_card', href: '/customer/my-card', icon: CreditCard },
  { key: 'consumptions', labelKey: 'consumptions', href: '/customer/consumptions', icon: History },
  { key: 'scan', labelKey: 'scan', href: '/customer/scan', icon: QrCode },
  { key: 'feedbacks', labelKey: 'feedbacks', href: '/customer/feedbacks', icon: MessageSquare },
  { key: 'remedy', labelKey: 'remedy', href: '/customer/remedy', icon: Gift },
  { key: 'ai_insights', labelKey: 'ai_insights', href: '/customer/ai-insights', icon: Sparkles },
  { key: 'trends', labelKey: 'trends', href: '/customer/trends', icon: TrendingUp },
  { key: 'journey_score', labelKey: 'journey_score', href: '/customer/journey-score', icon: Compass },
  { key: 'nearby', labelKey: 'nearby', href: '/customer/nearby', icon: MapPin },
  { key: 'experiences', labelKey: 'experiences', href: '/customer/experiences', icon: Share2 },
  { key: 'analytics', labelKey: 'analytics', href: '/customer/analytics', icon: BarChart3 },
  { key: 'badges', labelKey: 'badges', href: '/customer/badges', icon: Trophy },
  { key: 'shop', labelKey: 'shop', href: '/customer/shop', icon: ShoppingBag },
  { key: 'squads', labelKey: 'squads', href: '/customer/squads', icon: Users2 },
  { key: 'quests', labelKey: 'quests', href: '/customer/quests', icon: Target },
  { key: 'rewards', labelKey: 'rewards', href: '/customer/rewards', icon: Gift },
  { key: 'surprise_boxes', labelKey: 'surprise_boxes', href: '/customer/surprise-boxes', icon: Box },
  { key: 'campaigns', labelKey: 'campaigns', href: '/customer/campaigns', icon: Megaphone },
  { key: 'donations', labelKey: 'donations', href: '/customer/donations', icon: Heart },
  { key: 'leaderboard', labelKey: 'leaderboard', href: '/customer/leaderboard', icon: Trophy },
  { key: 'settings', labelKey: 'settings', href: '/customer/settings', icon: Settings },
];

export function Sidebar({ role, siteName = 'QRATEX' }: SidebarProps) {
  const t = useAppT();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [feedbackBadge, setFeedbackBadge] = useState<number | null>(null);
  const [menuVisibility, setMenuVisibility] = useState<Record<string, boolean>>({});
  const [featureVisibility, setFeatureVisibility] = useState<Record<string, boolean>>({});
  const [moduleControls, setModuleControls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (role !== 'DEALER') return;
    fetch('/api/dealer/notification-badges')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.badgeCount === 'number') setFeedbackBadge(data.badgeCount);
      })
      .catch(() => { });
  }, [role]);

  useEffect(() => {
    if (role === 'ADMIN') return;
    fetch('/api/settings/visibility', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.menuVisibility && typeof data.menuVisibility === 'object') {
          setMenuVisibility(data.menuVisibility as Record<string, boolean>);
        }
        if (data?.success && data?.featureVisibility && typeof data.featureVisibility === 'object') {
          setFeatureVisibility(data.featureVisibility as Record<string, boolean>);
        }
        if (data?.success && data?.moduleControls && typeof data.moduleControls === 'object') {
          setModuleControls(data.moduleControls as Record<string, boolean>);
        }
      })
      .catch(() => {});
  }, [role]);

  const navItems = role === 'ADMIN'
    ? adminNavItems
    : role === 'DEALER'
      ? dealerNavItems
      : customerNavItems;
  const filteredNavItems = role === 'ADMIN'
    ? navItems
    : navItems.filter((item) => {
      const key = item.key ?? item.href;
      const menuEnabled = menuVisibility[key] !== false;
      const featureEnabled = featureVisibility[key] !== false;
      const moduleEnabled = moduleControls[key] !== false;
      return menuEnabled && featureEnabled && moduleEnabled;
    });
  const navNs = role === 'ADMIN' ? 'admin' : role === 'DEALER' ? 'dealer' : 'customer';
  const visibleNavItems = filteredNavItems.map((item) => ({
    ...item,
    label: t(`sidebarNav.${navNs}.${item.labelKey}`),
  }));

  const levelProgress = calculateLevelProgress(session?.user?.points || 0);

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      'flex flex-col h-full',
      mobile ? 'w-full' : isCollapsed ? 'w-[72px]' : 'w-72'
    )}>
      {/* Header — üst çizgi yüksekliği DashboardHeader ile aynı: min-h-14 sm:min-h-16 + py-2 sm:py-0 */}
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-1.5 border-b border-border/60 px-2 py-2 sm:min-h-16 sm:gap-2 sm:px-3 sm:py-0">
        <Link
          href="/"
          className="flex h-12 min-h-0 min-w-0 flex-1 items-center gap-2 sm:h-16 sm:gap-2.5 rounded-lg outline-none ring-offset-background transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mounted && (
            <>
              {/* Dark theme logo (light/white colored) */}
              <Image
                src="/logo/logo.png"
                alt={`${siteName} Logo`}
                width={64}
                height={64}
                priority
                className="hidden h-10 w-10 shrink-0 object-contain dark:block sm:h-12 sm:w-12"
              />
              {/* Light theme logo (dark colored) */}
              <Image
                src="/logo/logo-light.png"
                alt={`${siteName} Logo`}
                width={64}
                height={64}
                priority
                className="block h-10 w-10 shrink-0 object-contain dark:hidden sm:h-12 sm:w-12"
              />
              {(!isCollapsed || mobile) && (
                <div className="flex min-h-0 min-w-0 flex-1 items-center self-stretch">
                  {/* Dark theme font */}
                  <Image
                    src="/logo/font.png"
                    alt={siteName}
                    width={180}
                    height={52}
                    priority
                    sizes="(min-width: 1024px) 240px, 180px"
                    className="hidden max-h-10 w-auto max-w-full object-contain object-left dark:block sm:max-h-12"
                  />
                  {/* Light theme font */}
                  <Image
                    src="/logo/font-light.png"
                    alt={siteName}
                    width={180}
                    height={52}
                    priority
                    sizes="(min-width: 1024px) 240px, 180px"
                    className="block max-h-10 w-auto max-w-full object-contain object-left dark:hidden sm:max-h-12"
                  />
                </div>
              )}
            </>
          )}
        </Link>
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden h-9 min-h-9 w-9 min-w-9 shrink-0 cursor-pointer touch-manipulation transition-colors duration-200 sm:h-10 sm:min-h-10 sm:w-10 sm:min-w-10 lg:flex"
            aria-label={isCollapsed ? t('appShell.sidebarExpand') : t('appShell.sidebarCollapse')}
          >
            <ChevronLeft
              aria-hidden
              className={cn(
                'h-4 w-4 transition-transform',
                isCollapsed && 'rotate-180'
              )}
            />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4 no-scrollbar" aria-label={t('appShell.sidebarAppMenu')}>
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== `/${role.toLowerCase()}` && pathname.startsWith(item.href));
          const badgeNum = item.href === '/dealer/feedbacks' && feedbackBadge != null
            ? feedbackBadge
            : item.badge;
          const showBadge = typeof badgeNum === 'number' && badgeNum > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => mobile && setIsMobileOpen(false)}
              className={cn(
                'group relative flex min-h-11 cursor-pointer touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 transition-[color,background-color,border-color,box-shadow] duration-200 ease-out',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 border border-transparent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/80 border border-transparent hover:border-border/50'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(!isCollapsed || mobile) && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className={cn(
                      'px-2 py-0.5 text-xs rounded-full min-w-[1.25rem] text-center',
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-primary text-primary-foreground'
                    )}>
                      {badgeNum > 99 ? '99+' : badgeNum}
                    </span>
                  )}
                </>
              )}
              {isCollapsed && !mobile && showBadge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {badgeNum > 99 ? '99+' : badgeNum}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* User Section */}
      <div className="p-4">
        {role !== 'ADMIN' && (!isCollapsed || mobile) && (
          <div className="mb-4 p-3 rounded-xl border border-border/40 bg-muted/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('appShell.level')} {session?.user?.level || 1}</span>
              <span className="text-xs text-muted-foreground">{session?.user?.points || 0} XP</span>
            </div>
            <Progress value={levelProgress} className="h-2" />
          </div>
        )}

        <div className={cn(
          'flex items-center gap-3',
          isCollapsed && !mobile ? 'justify-center' : ''
        )}>
          <Avatar>
            <AvatarImage src={session?.user?.image || ''} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
              {getInitials(session?.user?.name)}
            </AvatarFallback>
          </Avatar>
          {(!isCollapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session?.user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
            </div>
          )}
          {(!isCollapsed || mobile) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: '/auth/login', redirect: true })}
              className="text-muted-foreground hover:text-destructive h-8 w-8"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        aria-label={t('appShell.sidebarPanelMenu')}
        className={cn(
          'app-sidebar-surface hidden lg:flex flex-col border-r border-border/60 backdrop-blur-md transition-all duration-300',
          isCollapsed ? 'w-[72px]' : 'w-72'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar - floating button + drawer. Sheet only after mount to avoid Radix aria-controls hydration mismatch. */}
      {mounted ? (
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild className="lg:hidden fixed z-50 touch-manipulation left-4 bottom-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              variant="gradient"
              size="icon"
              className="h-14 min-h-14 min-w-14 w-14 touch-manipulation rounded-full shadow-xl transition-shadow duration-200"
              aria-label={t('appShell.openMenu')}
            >
              <Menu className="h-6 w-6" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[min(20rem,85vw)] max-w-sm">
            <SidebarContent mobile />
          </SheetContent>
        </Sheet>
      ) : (
        <div className="lg:hidden fixed z-50 left-4 bottom-[max(1rem,env(safe-area-inset-bottom))] h-14 w-14 min-w-14 min-h-14 rounded-full bg-primary shadow-xl" aria-hidden />
      )}
    </>
  );
}
