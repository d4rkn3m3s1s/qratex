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
  Target,
  Store,
  CreditCard,
  FileText,
  Palette,
  ToggleLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn, getInitials, calculateLevelProgress } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface SidebarProps {
  role: 'ADMIN' | 'DEALER' | 'CUSTOMER';
}

const adminNavItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Kullanıcılar', icon: Users },
  { href: '/admin/feedbacks', label: 'Geri Bildirimler', icon: MessageSquare },
  { href: '/admin/badges', label: 'Rozetler', icon: Trophy },
  { href: '/admin/quests', label: 'Görevler', icon: Target },
  { href: '/admin/rewards', label: 'Ödüller', icon: Gift },
  { href: '/admin/analytics', label: 'Analitik', icon: BarChart3 },
  { href: '/admin/pricing', label: 'Fiyatlandırma', icon: CreditCard },
  { href: '/admin/pages', label: 'Sayfalar', icon: FileText },
  { href: '/admin/themes', label: 'Temalar', icon: Palette },
  { href: '/admin/features', label: 'Özellikler', icon: ToggleLeft },
  { href: '/admin/settings', label: 'Ayarlar', icon: Settings },
];

const dealerNavItems: NavItem[] = [
  { href: '/dealer', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dealer/qr-codes', label: 'QR Kodlar', icon: QrCode },
  { href: '/dealer/feedbacks', label: 'Geri Bildirimler', icon: MessageSquare, badge: 5 },
  { href: '/dealer/analytics', label: 'Analitik', icon: BarChart3 },
  { href: '/dealer/ai-insights', label: 'AI İçgörüler', icon: Sparkles },
  { href: '/dealer/settings', label: 'Ayarlar', icon: Settings },
];

const customerNavItems: NavItem[] = [
  { href: '/customer', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customer/scan', label: 'QR Tara', icon: QrCode },
  { href: '/customer/feedbacks', label: 'Geri Bildirimlerim', icon: MessageSquare },
  { href: '/customer/badges', label: 'Rozetlerim', icon: Trophy },
  { href: '/customer/quests', label: 'Görevler', icon: Target },
  { href: '/customer/rewards', label: 'Ödüller', icon: Gift },
  { href: '/customer/leaderboard', label: 'Liderlik', icon: BarChart3 },
  { href: '/customer/settings', label: 'Ayarlar', icon: Settings },
];

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = role === 'ADMIN' 
    ? adminNavItems 
    : role === 'DEALER' 
    ? dealerNavItems 
    : customerNavItems;

  const levelProgress = calculateLevelProgress(session?.user?.points || 0);

  // Get the correct logo based on theme
  const logoSrc = mounted && resolvedTheme === 'dark' 
    ? '/logo/logo.png' 
    : '/logo/logo-light.png';

  const fontLogoSrc = mounted && resolvedTheme === 'dark'
    ? '/logo/font.png'
    : '/logo/font-light.png';

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      'flex flex-col h-full',
      mobile ? 'w-full' : isCollapsed ? 'w-[72px]' : 'w-64'
    )}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          {mounted && (
            <>
              <Image
                src={logoSrc}
                alt="QRATEX Logo"
                width={48}
                height={48}
                priority
                className="object-contain flex-shrink-0"
              />
              {(!isCollapsed || mobile) && (
                <Image
                  src={fontLogoSrc}
                  alt="QRATEX"
                  width={120}
                  height={32}
                  priority
                  className="object-contain"
                  style={{ width: 'auto', height: 'auto' }}
                />
              )}
            </>
          )}
        </Link>
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex h-8 w-8"
          >
            <ChevronLeft className={cn(
              'w-4 h-4 transition-transform',
              isCollapsed && 'rotate-180'
            )} />
          </Button>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== `/${role.toLowerCase()}` && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => mobile && setIsMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group relative',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(!isCollapsed || mobile) && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn(
                      'px-2 py-0.5 text-xs rounded-full',
                      isActive 
                        ? 'bg-primary-foreground/20 text-primary-foreground' 
                        : 'bg-primary text-primary-foreground'
                    )}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {isCollapsed && !mobile && item.badge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {item.badge}
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
          <div className="mb-4 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Seviye {session?.user?.level || 1}</span>
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
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
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
              onClick={() => signOut({ callbackUrl: '/' })}
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
      <aside className={cn(
        'hidden lg:flex flex-col border-r bg-card transition-all duration-300',
        isCollapsed ? 'w-[72px]' : 'w-64'
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetTrigger asChild className="lg:hidden fixed bottom-4 left-4 z-50">
          <Button variant="gradient" size="icon" className="rounded-full shadow-lg">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-80">
          <SidebarContent mobile />
        </SheetContent>
      </Sheet>
    </>
  );
}
