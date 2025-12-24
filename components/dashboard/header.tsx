'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Bell, Search, Settings, User, LogOut, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle, XCircle, ExternalLink, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { getInitials } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

interface DashboardHeaderProps {
  title?: string;
  description?: string;
  showSearch?: boolean;
  actions?: React.ReactNode;
}

const notificationIcons: Record<string, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

// Default icon for unknown notification types
const getNotificationIcon = (type: string | undefined) => {
  return notificationIcons[type || 'info'] || Info;
};

const notificationColors = {
  info: 'text-blue-500',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
};

export function DashboardHeader({ title, description, showSearch = true, actions }: DashboardHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const lastNotificationIdRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const res = await fetch('/api/notifications?limit=10');
      const data = await res.json();

      if (data.success) {
        const newNotifications = data.notifications as Notification[];
        
        // Check for new notifications and show toast (only after first load)
        if (!isFirstLoadRef.current && newNotifications.length > 0) {
          const latestNotification = newNotifications[0];
          
          if (lastNotificationIdRef.current && latestNotification.id !== lastNotificationIdRef.current) {
            // Find all new notifications
            const newOnes = newNotifications.filter(n => {
              const existingIds = notifications.map(existing => existing.id);
              return !existingIds.includes(n.id);
            });

            // Show toast for each new notification
            newOnes.forEach((n) => {
              const Icon = getNotificationIcon(n.type);
              const colorClass = notificationColors[n.type] || notificationColors.info;
              toast(n.title, {
                description: n.message,
                icon: <Icon className={`h-5 w-5 ${colorClass}`} />,
                duration: 5000,
              });
            });
          }
        }

        // Update last notification ID
        if (newNotifications.length > 0) {
          lastNotificationIdRef.current = newNotifications[0].id;
        }

        setNotifications(newNotifications);
        setUnreadCount(data.unreadCount);
        isFirstLoadRef.current = false;
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [session?.user?.id, notifications]);

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();

    // Poll for new notifications every 10 seconds
    const interval = setInterval(fetchNotifications, 10000);

    return () => clearInterval(interval);
  }, [session?.user?.id]); // Only depend on session, not fetchNotifications

  // Mark single notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });

      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('Tüm bildirimler okundu olarak işaretlendi');
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await fetch(`/api/notifications?id=${notificationId}`, {
        method: 'DELETE',
      });

      const notification = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Format time
  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch {
      return '';
    }
  };

  // Format full date
  const formatFullDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'd MMMM yyyy, HH:mm', { locale: tr });
    } catch {
      return '';
    }
  };

  // Open notification modal
  const openNotification = (notification: Notification) => {
    setSelectedNotification(notification);
    setIsModalOpen(true);
    setIsOpen(false);
    
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  const getSettingsLink = () => {
    switch (session?.user?.role) {
      case 'ADMIN': return '/admin/settings';
      case 'DEALER': return '/dealer/settings';
      default: return '/customer/settings';
    }
  };

  return (
    <header className="sticky top-0 z-40 -mx-4 lg:-mx-6 px-4 lg:px-6 border-b bg-background/95 backdrop-blur-xl safe-top mb-2">
      <div className="flex h-16 items-center justify-between">
        {/* Left - Title & Search */}
        <div className="flex items-center gap-4 flex-1">
          {title && (
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          {showSearch && (
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Ara..."
                className="pl-10 bg-muted/50 border-transparent focus:border-input"
              />
            </div>
          )}
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-2">
          {/* Page Actions */}
          {actions}
          
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {mounted && resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5 text-yellow-500" />
            ) : mounted && resolvedTheme === 'light' ? (
              <Moon className="h-5 w-5 text-slate-700" />
            ) : (
              <Moon className="h-5 w-5 text-slate-400" />
            )}
            <span className="sr-only">Tema değiştir</span>
          </Button>

          {/* Notifications */}
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Bildirimler
                </span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <>
                      <Badge variant="secondary" className="text-xs">
                        {unreadCount} yeni
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={markAllAsRead}
                      >
                        <CheckCheck className="h-3 w-3 mr-1" />
                        Tümünü Oku
                      </Button>
                    </>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Bildirim yok</p>
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.map((notification) => {
                    const Icon = getNotificationIcon(notification.type);
                    const colorClass = notificationColors[notification.type] || notificationColors.info;
                    return (
                      <DropdownMenuItem
                        key={notification.id}
                        className="flex items-start gap-3 p-3 cursor-pointer group"
                        onClick={() => openNotification(notification)}
                      >
                        <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-500/10' : notification.type === 'warning' ? 'bg-yellow-500/10' : notification.type === 'error' ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
                          <Icon className={`h-4 w-4 ${colorClass}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm ${!notification.isRead ? 'font-semibold' : ''}`}>
                              {notification.title}
                            </p>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-muted-foreground">
                              {formatTime(notification.createdAt)}
                            </p>
                            <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              Detay <ExternalLink className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => deleteNotification(notification.id, e)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={session?.user?.image || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-sm">
                    {getInitials(session?.user?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {session?.user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="cursor-pointer"
                onClick={() => router.push(getSettingsLink())}
              >
                <User className="mr-2 h-4 w-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="cursor-pointer"
                onClick={() => router.push(getSettingsLink())}
              >
                <Settings className="mr-2 h-4 w-4" />
                Ayarlar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Çıkış Yap
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Notification Detail Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          {selectedNotification && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className={`p-3 rounded-full flex-shrink-0 ${
                      selectedNotification.type === 'success' ? 'bg-green-500/10' : 
                      selectedNotification.type === 'warning' ? 'bg-yellow-500/10' : 
                      selectedNotification.type === 'error' ? 'bg-red-500/10' : 'bg-blue-500/10'
                    }`}
                  >
                    {(() => {
                      const Icon = getNotificationIcon(selectedNotification.type);
                      const colorClass = notificationColors[selectedNotification.type] || notificationColors.info;
                      return <Icon className={`h-6 w-6 ${colorClass}`} />;
                    })()}
                  </motion.div>
                  <div className="flex-1">
                    <DialogTitle className="text-lg">
                      {selectedNotification.title}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {formatFullDate(selectedNotification.createdAt)}
                    </DialogDescription>
                  </div>
                  <Badge 
                    variant={
                      selectedNotification.type === 'success' ? 'default' :
                      selectedNotification.type === 'warning' ? 'secondary' :
                      selectedNotification.type === 'error' ? 'destructive' : 'outline'
                    }
                    className="flex-shrink-0"
                  >
                    {selectedNotification.type === 'success' && 'Başarılı'}
                    {selectedNotification.type === 'warning' && 'Uyarı'}
                    {selectedNotification.type === 'error' && 'Hata'}
                    {selectedNotification.type === 'info' && 'Bilgi'}
                  </Badge>
                </div>
              </DialogHeader>
              
              <Separator className="my-4" />
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
              >
                {/* Message Content */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedNotification.message}
                  </p>
                </div>

                {/* Additional Data */}
                {selectedNotification.data && Object.keys(selectedNotification.data).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Ek Bilgiler</p>
                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(selectedNotification.data).map(([key, value]) => (
                          <div key={key} className="space-y-1">
                            <p className="text-xs text-muted-foreground capitalize">
                              {key.replace(/_/g, ' ')}
                            </p>
                            <p className="text-sm font-medium">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      deleteNotification(selectedNotification.id, { stopPropagation: () => {} } as React.MouseEvent);
                      setIsModalOpen(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Bildirimi Sil
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Tamam
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </header>
  );
}
