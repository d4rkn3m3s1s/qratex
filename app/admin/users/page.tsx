'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Shield,
  Store,
  User,
  Mail,
  Calendar,
  Trophy,
  Gift,
  Star,
  Zap,
  Bell,
  Plus,
  Minus,
  Award,
  Crown,
  Target,
  X,
  Check,
  RefreshCw,
  Download,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/lib/admin-toast';
import { formatDate, getInitials } from '@/lib/utils';
import { exportToCSV } from '@/lib/export-utils';
import { UsersAutomationPanel } from '@/components/admin/users-automation-panel';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

interface UserType {
  id: string;
  name: string | null;
  email: string;
  role: 'ADMIN' | 'DEALER' | 'CUSTOMER';
  image: string | null;
  points: number;
  level: number;
  xp: number;
  businessName?: string | null;
  businessDesc?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  emailVerified?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    feedbacks: number;
    qrCodes: number;
    badges: number;
  };
}

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
}

interface RewardType {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  type: string;
}

interface UserBadgeType {
  id: string;
  badgeId: string;
  earnedAt: string;
  badge: BadgeType;
}

const roleColors = {
  ADMIN: 'bg-red-500/10 text-red-500 border-red-500/20',
  DEALER: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  CUSTOMER: 'bg-green-500/10 text-green-500 border-green-500/20',
};

const roleIcons = {
  ADMIN: Shield,
  DEALER: Store,
  CUSTOMER: User,
};

const roleLabels = {
  ADMIN: 'Admin',
  DEALER: 'Bayi',
  CUSTOMER: 'Müşteri',
};

const rarityColors = {
  common: 'bg-gray-500/10 text-gray-500',
  rare: 'bg-blue-500/10 text-blue-500',
  epic: 'bg-primary/10 text-primary',
  legendary: 'bg-yellow-500/10 text-yellow-500',
};

export default function AdminUsersPage() {
  const [mainTab, setMainTab] = useState<'users' | 'automation'>('users');
  const [users, setUsers] = useState<UserType[]>([]);
  const [allBadges, setAllBadges] = useState<BadgeType[]>([]);
  const [allRewards, setAllRewards] = useState<RewardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Dialogs
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [userBadges, setUserBadges] = useState<UserBadgeType[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchDebounced, setSearchDebounced] = useState('');
  
  // Create user form
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CUSTOMER' as 'ADMIN' | 'DEALER' | 'CUSTOMER',
    businessName: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  
  // Action form states
  const [pointsAmount, setPointsAmount] = useState<number>(100);
  const [pointsReason, setPointsReason] = useState('');
  const [xpAmount, setXpAmount] = useState<number>(100);
  const [newLevel, setNewLevel] = useState<number>(1);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string>('');
  const [selectedRewardId, setSelectedRewardId] = useState<string>('');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [actionLoading, setActionLoading] = useState(false);
  const [dealerInfoSaving, setDealerInfoSaving] = useState(false);
  const [dealerInfoForm, setDealerInfoForm] = useState({
    businessName: '',
    businessDesc: '',
    address: '',
    latitude: '',
    longitude: '',
  });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, searchDebounced]);

  useEffect(() => {
    fetchUsers();
    fetchBadges();
    fetchRewards();
  }, [roleFilter, searchDebounced, page, pageSize]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (searchDebounced) params.append('search', searchDebounced);
      params.append('pageSize', String(pageSize));
      params.append('page', String(page));
      
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      
      if (res.ok && data.items) {
        setUsers(data.items);
        setTotal(data.total ?? data.items.length);
        setTotalPages(data.totalPages ?? Math.ceil((data.total ?? 0) / pageSize));
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    const { name, email, password, role, businessName } = createForm;
    if (!name.trim() || !email.trim() || !password || password.length < 8) {
      toast.error('İsim, geçerli email ve en az 8 karakterlik şifre gerekli');
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role, businessName: businessName || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Kullanıcı oluşturuldu');
        setCreateDialogOpen(false);
        setCreateForm({ name: '', email: '', password: '', role: 'CUSTOMER', businessName: '' });
        fetchUsers();
      } else {
        toast.error(data.error || 'Kullanıcı oluşturulamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleExportCSV = () => {
    const cols = [
      { key: 'name', label: 'İsim' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Rol' },
      { key: 'points', label: 'Puan' },
      { key: 'level', label: 'Seviye' },
      { key: 'businessName', label: 'İşletme Adı' },
      { key: 'createdAt', label: 'Kayıt Tarihi' },
    ];
    const rows = users.map((u) => ({
      name: u.name ?? '',
      email: u.email,
      role: roleLabels[u.role],
      points: u.points,
      level: u.level,
      businessName: u.businessName ?? '',
      createdAt: formatDate(u.createdAt),
    }));
    exportToCSV(rows, 'qratex_kullanicilar', cols);
    toast.success('CSV indirildi');
  };

  const fetchBadges = async () => {
    try {
      const res = await fetch('/api/gamification/badges');
      const data = await res.json();
      if (data.success) {
        setAllBadges(data.data);
      }
    } catch (error) {
      console.error('Badges fetch error:', error);
    }
  };

  const fetchRewards = async () => {
    try {
      const res = await fetch('/api/gamification/rewards');
      const data = await res.json();
      if (data.success) {
        setAllRewards(data.data);
      }
    } catch (error) {
      console.error('Rewards fetch error:', error);
    }
  };

  const fetchUserBadges = async (userId: string) => {
    try {
      const res = await fetch(`/api/gamification/badges?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setUserBadges(data.userBadges || []);
      }
    } catch (error) {
      console.error('User badges fetch error:', error);
    }
  };

  const bulkRole = async (role: 'ADMIN' | 'DEALER' | 'CUSTOMER') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_role', userIds: ids, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Başarısız');
      toast.success(`${data.updated ?? 0} kullanıcının rolü güncellendi`);
      setSelectedIds(new Set());
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplu rol güncellenemedi');
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', userIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Başarısız');
      toast.success(`${data.deleted ?? 0} kullanıcı silindi`);
      setSelectedIds(new Set());
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplu silme başarısız');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredUsers.map((u) => u.id)));
  };

  const handleOpenDetails = async (user: UserType) => {
    setSelectedUser(user);
    setNewLevel(user.level);
    setDealerInfoForm({
      businessName: user.businessName || '',
      businessDesc: user.businessDesc || '',
      address: user.address || '',
      latitude: typeof user.latitude === 'number' ? String(user.latitude) : '',
      longitude: typeof user.longitude === 'number' ? String(user.longitude) : '',
    });
    await fetchUserBadges(user.id);
    setDetailsOpen(true);
  };

  const handleSaveDealerInfo = async () => {
    if (!selectedUser || selectedUser.role !== 'DEALER') return;
    setDealerInfoSaving(true);
    try {
      const res = await fetch(`/api/admin/users?id=${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: dealerInfoForm.businessName || null,
          businessDesc: dealerInfoForm.businessDesc || null,
          address: dealerInfoForm.address || null,
          latitude: dealerInfoForm.latitude !== '' ? Number(dealerInfoForm.latitude) : null,
          longitude: dealerInfoForm.longitude !== '' ? Number(dealerInfoForm.longitude) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Bayi bilgileri güncellenemedi');
        return;
      }
      toast.success('Bayi konum bilgileri güncellendi');
      setSelectedUser((prev) =>
        prev
          ? {
              ...prev,
              businessName: dealerInfoForm.businessName || null,
              businessDesc: dealerInfoForm.businessDesc || null,
              address: dealerInfoForm.address || null,
              latitude: dealerInfoForm.latitude !== '' ? Number(dealerInfoForm.latitude) : null,
              longitude: dealerInfoForm.longitude !== '' ? Number(dealerInfoForm.longitude) : null,
            }
          : prev
      );
      fetchUsers();
    } catch (error) {
      toast.error('Bayi bilgileri güncellenemedi');
    } finally {
      setDealerInfoSaving(false);
    }
  };

  const handleAction = async () => {
    if (!selectedUser) return;
    setActionLoading(true);

    try {
      let body: Record<string, unknown> = { userId: selectedUser.id };

      switch (actionType) {
        case 'add_points':
          body = { ...body, action: 'add_points', amount: pointsAmount, reason: pointsReason };
          break;
        case 'remove_points':
          body = { ...body, action: 'add_points', amount: -Math.abs(pointsAmount), reason: pointsReason };
          break;
        case 'add_xp':
          body = { ...body, action: 'add_xp', amount: xpAmount };
          break;
        case 'set_level':
          body = { ...body, action: 'set_level', level: newLevel };
          break;
        case 'grant_badge':
          if (!selectedBadgeId) {
            toast.error('Rozet seçin');
            setActionLoading(false);
            return;
          }
          body = { ...body, action: 'grant_badge', badgeId: selectedBadgeId };
          break;
        case 'grant_reward':
          if (!selectedRewardId) {
            toast.error('Ödül seçin');
            setActionLoading(false);
            return;
          }
          body = { ...body, action: 'grant_reward', rewardId: selectedRewardId };
          break;
        case 'send_notification':
          if (!notificationTitle || !notificationMessage) {
            toast.error('Başlık ve mesaj gerekli');
            setActionLoading(false);
            return;
          }
          body = { 
            ...body, 
            action: 'send_notification', 
            title: notificationTitle, 
            message: notificationMessage,
            type: notificationType 
          };
          break;
        default:
          return;
      }

      const res = await fetch(`/api/admin/users?id=${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success('İşlem başarılı!');
        setActionDialogOpen(false);
        fetchUsers();
        if (selectedUser) {
          fetchUserBadges(selectedUser.id);
        }
        resetActionForm();
      } else {
        toast.error(data.error || 'İşlem başarısız');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeBadge = async (badgeId: string) => {
    if (!selectedUser) return;
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke_badge',
          userId: selectedUser.id,
          badgeId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Rozet kaldırıldı');
        fetchUserBadges(selectedUser.id);
        fetchUsers();
      } else {
        toast.error(data.error || 'İşlem başarısız');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (res.ok) {
        toast.success('Rol güncellendi');
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Rol güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      const res = await fetch(`/api/admin/users?id=${selectedUser.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('Kullanıcı silindi');
        setDeleteDialogOpen(false);
        setDetailsOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Kullanıcı silinemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const resetActionForm = () => {
    setPointsAmount(100);
    setPointsReason('');
    setXpAmount(100);
    setSelectedBadgeId('');
    setSelectedRewardId('');
    setNotificationTitle('');
    setNotificationMessage('');
    setNotificationType('info');
  };

  const openActionDialog = (type: string) => {
    setActionType(type);
    resetActionForm();
    setActionDialogOpen(true);
  };

  const filteredUsers = users;

  const stats = {
    total: total > 0 ? total : users.length,
    admins: users.filter((u) => u.role === 'ADMIN').length,
    dealers: users.filter((u) => u.role === 'DEALER').length,
    customers: users.filter((u) => u.role === 'CUSTOMER').length,
  };

  const getActionTitle = () => {
    switch (actionType) {
      case 'add_points': return 'Puan Ekle';
      case 'remove_points': return 'Puan Düş';
      case 'add_xp': return 'XP Ekle';
      case 'set_level': return 'Seviye Ayarla';
      case 'grant_badge': return 'Rozet Ver';
      case 'grant_reward': return 'Ödül Ver';
      case 'send_notification': return 'Bildirim Gönder';
      default: return 'İşlem';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <AdminPremiumHero
        eyebrow="Kimlik ve erişim"
        title="Kullanıcı yönetimi"
        description="Tüm kullanıcıları görüntüleyin ve yönetin."
        icon={<Users className="text-white" />}
        chips={
          <div className="inline-flex gap-1 rounded-lg border border-white/25 bg-white/10 p-1">
            <Button
              type="button"
              variant={mainTab === 'users' ? 'secondary' : 'ghost'}
              size="sm"
              className={mainTab === 'users' ? 'bg-white text-emerald-900' : 'text-white hover:bg-white/15'}
              onClick={() => setMainTab('users')}
            >
              Users
            </Button>
            <Button
              type="button"
              variant={mainTab === 'automation' ? 'secondary' : 'ghost'}
              size="sm"
              className={mainTab === 'automation' ? 'bg-white text-emerald-900' : 'text-white hover:bg-white/15'}
              onClick={() => setMainTab('automation')}
            >
              Automation
            </Button>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 bg-white text-emerald-900 hover:bg-white/90 shadow-md">
              <Plus className="h-4 w-4" />
              Kullanıcı Ekle
            </Button>
            <Button
              onClick={handleExportCSV}
              variant="outline"
              size="sm"
              className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              disabled={users.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button onClick={fetchUsers} variant="outline" size="sm" className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
              <RefreshCw className="h-4 w-4" />
              Yenile
            </Button>
          </div>
        }
      />

      {mainTab === 'automation' ? (
        <UsersAutomationPanel />
      ) : (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card glass>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Toplam</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.admins}</p>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Store className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.dealers}</p>
                <p className="text-xs text-muted-foreground">Bayi</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <User className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.customers}</p>
                <p className="text-xs text-muted-foreground">Müşteri</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card glass>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İsim, email veya işletme adı ile ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Rol Filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="DEALER">Bayi</SelectItem>
                <SelectItem value="CUSTOMER">Müşteri</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card glass>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">Yükleniyor...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Kullanıcı bulunamadı</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 mb-2 rounded-lg bg-muted/50 border">
                  <span className="text-sm font-medium">{selectedIds.size} seçili</span>
                  <Select onValueChange={(v) => v && bulkRole(v as 'ADMIN' | 'DEALER' | 'CUSTOMER')}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Rol değiştir" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin yap</SelectItem>
                      <SelectItem value="DEALER">Bayi yap</SelectItem>
                      <SelectItem value="CUSTOMER">Müşteri yap</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={bulkLoading}>
                    Seçilenleri sil
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Seçimi temizle
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredUsers.length > 0 && selectedIds.size === filteredUsers.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Tümünü seç"
                      />
                    </TableHead>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="hidden md:table-cell">Puan</TableHead>
                    <TableHead className="hidden md:table-cell">Seviye</TableHead>
                    <TableHead className="hidden lg:table-cell">Rozetler</TableHead>
                    <TableHead className="hidden lg:table-cell">Kayıt</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user, index) => {
                    const RoleIcon = roleIcons[user.role];
                    return (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="group cursor-pointer hover:bg-muted/50"
                        onClick={() => handleOpenDetails(user)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(user.id)}
                            onCheckedChange={() => toggleSelect(user.id)}
                            aria-label={`${user.email} seç`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={user.image || ''} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {getInitials(user.name || user.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.name || 'İsimsiz'}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={roleColors[user.role]}>
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {roleLabels[user.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className="font-medium">{user.points.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="gap-1">
                              <Crown className="h-3 w-3 text-yellow-500" />
                              Lv. {user.level}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1">
                            <Trophy className="h-4 w-4 text-primary" />
                            <span>{user._count?.badges || 0}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuLabel>Hızlı İşlemler</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setSelectedUser(user); openActionDialog('add_points'); }}>
                                <Plus className="h-4 w-4 mr-2 text-green-500" />
                                Puan Ekle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(user); openActionDialog('add_xp'); }}>
                                <Zap className="h-4 w-4 mr-2 text-blue-500" />
                                XP Ekle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(user); openActionDialog('grant_badge'); }}>
                                <Trophy className="h-4 w-4 mr-2 text-primary" />
                                Rozet Ver
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(user); openActionDialog('grant_reward'); }}>
                                <Gift className="h-4 w-4 mr-2 text-primary" />
                                Ödül Ver
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground">Rol Değiştir</DropdownMenuLabel>
                              {(['ADMIN', 'DEALER', 'CUSTOMER'] as const).map((role) => (
                                <DropdownMenuItem
                                  key={role}
                                  onClick={() => handleRoleChange(user.id, role)}
                                  disabled={user.role === role}
                                >
                                  {React.createElement(roleIcons[role], { className: `h-4 w-4 mr-2 ${role === 'ADMIN' ? 'text-red-500' : role === 'DEALER' ? 'text-blue-500' : 'text-green-500'}` })}
                                  {roleLabels[role]}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => { setSelectedUser(user); setDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Sil
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            )}
            {/* Pagination */}
            {!loading && filteredUsers.length > 0 && total > pageSize && (
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground min-w-0 break-words">
                  Toplam <strong className="text-foreground">{total}</strong> kullanıcı
                  {totalPages > 1 && ` · Sayfa ${page} / ${totalPages}`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-full min-w-0 sm:w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                    Önceki
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    Sonraki
                  </Button>
                </div>
              </div>
            )}
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[min(100vw-1.5rem,42rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {selectedUser && (
            <>
              <DialogHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-0">
                  <Avatar className="h-16 w-16 shrink-0">
                    <AvatarImage src={selectedUser.image || ''} />
                    <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                      {getInitials(selectedUser.name || selectedUser.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-lg sm:text-xl break-words">{selectedUser.name || 'İsimsiz'}</DialogTitle>
                    <DialogDescription className="break-all sm:break-words">{selectedUser.email}</DialogDescription>
                    <Badge className={`mt-2 ${roleColors[selectedUser.role]}`}>
                      {React.createElement(roleIcons[selectedUser.role], { className: 'h-3 w-3 mr-1' })}
                      {roleLabels[selectedUser.role]}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList className="grid w-full grid-cols-3 h-auto min-h-11 gap-1 p-1">
                  <TabsTrigger value="overview" className="text-xs sm:text-sm py-2.5 px-2">Genel</TabsTrigger>
                  <TabsTrigger value="badges" className="text-xs sm:text-sm py-2.5 px-2">Rozetler</TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs sm:text-sm py-2.5 px-2">İşlemler</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="p-4 rounded-lg bg-yellow-500/10 text-center">
                      <Star className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold">{selectedUser.points.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Puan</p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-500/10 text-center">
                      <Crown className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold">{selectedUser.level}</p>
                      <p className="text-xs text-muted-foreground">Seviye</p>
                    </div>
                    <div className="p-4 rounded-lg bg-primary/10 text-center">
                      <Zap className="h-6 w-6 text-primary mx-auto mb-2" />
                      <p className="text-2xl font-bold">{selectedUser.xp.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">XP</p>
                    </div>
                  </div>

                  {/* Level Progress */}
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Seviye {selectedUser.level}</span>
                      <span>Seviye {selectedUser.level + 1}</span>
                    </div>
                    <Progress value={(selectedUser.xp % 1000) / 10} className="h-3" />
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      {selectedUser.xp % 1000} / 1000 XP
                    </p>
                  </div>

                  {/* User Info */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedUser.email}</span>
                      {selectedUser.emailVerified && (
                        <Badge variant="outline" className="text-green-500 border-green-500/20">
                          <Check className="h-3 w-3 mr-1" /> Doğrulanmış
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Kayıt: {formatDate(selectedUser.createdAt)}</span>
                    </div>
                    {selectedUser.businessName && (
                      <div className="flex items-center gap-3 text-sm">
                        <Store className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedUser.businessName}</span>
                      </div>
                    )}
                  </div>

                  {/* Activity Stats */}
                  {selectedUser._count && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-4 border-t">
                      <div className="text-center">
                        <p className="text-xl font-bold">{selectedUser._count.feedbacks}</p>
                        <p className="text-xs text-muted-foreground">Geri Bildirim</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{selectedUser._count.qrCodes}</p>
                        <p className="text-xs text-muted-foreground">QR Kod</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{selectedUser._count.badges}</p>
                        <p className="text-xs text-muted-foreground">Rozet</p>
                      </div>
                    </div>
                  )}

                  {selectedUser.role === 'DEALER' && (
                    <div className="space-y-3 border-t pt-4">
                      <h4 className="font-medium">Bayi Konum ve İşletme Bilgileri</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>İşletme Adı</Label>
                          <Input
                            value={dealerInfoForm.businessName}
                            onChange={(e) => setDealerInfoForm((prev) => ({ ...prev, businessName: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Adres</Label>
                          <Input
                            value={dealerInfoForm.address}
                            onChange={(e) => setDealerInfoForm((prev) => ({ ...prev, address: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Latitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={dealerInfoForm.latitude}
                            onChange={(e) => setDealerInfoForm((prev) => ({ ...prev, latitude: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Longitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={dealerInfoForm.longitude}
                            onChange={(e) => setDealerInfoForm((prev) => ({ ...prev, longitude: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Açıklama</Label>
                        <Textarea
                          rows={2}
                          value={dealerInfoForm.businessDesc}
                          onChange={(e) => setDealerInfoForm((prev) => ({ ...prev, businessDesc: e.target.value }))}
                        />
                      </div>
                      <Button onClick={handleSaveDealerInfo} disabled={dealerInfoSaving}>
                        {dealerInfoSaving ? 'Kaydediliyor...' : 'Bayi Bilgilerini Kaydet'}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="badges" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Kazanılan Rozetler ({userBadges.length})</h4>
                      <Button size="sm" onClick={() => openActionDialog('grant_badge')}>
                        <Plus className="h-4 w-4 mr-1" /> Rozet Ver
                      </Button>
                    </div>
                    
                    {userBadges.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Trophy className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Henüz rozet yok</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {userBadges.map((ub) => (
                          <div key={ub.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group">
                            <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                              <img src={ub.badge.icon} alt={ub.badge.name} className="w-8 h-8" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{ub.badge.name}</p>
                              <Badge className={`text-xs ${rarityColors[ub.badge.rarity as keyof typeof rarityColors]}`}>
                                {ub.badge.rarity}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 h-8 w-8"
                              onClick={() => handleRevokeBadge(ub.badgeId)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="actions" className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('add_points')}
                    >
                      <Plus className="h-5 w-5 text-green-500" />
                      <span>Puan Ekle</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('remove_points')}
                    >
                      <Minus className="h-5 w-5 text-red-500" />
                      <span>Puan Düş</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('add_xp')}
                    >
                      <Zap className="h-5 w-5 text-blue-500" />
                      <span>XP Ekle</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('set_level')}
                    >
                      <Crown className="h-5 w-5 text-yellow-500" />
                      <span>Seviye Ayarla</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('grant_badge')}
                    >
                      <Trophy className="h-5 w-5 text-primary" />
                      <span>Rozet Ver</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('grant_reward')}
                    >
                      <Gift className="h-5 w-5 text-primary" />
                      <span>Ödül Ver</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2 sm:col-span-2"
                      onClick={() => openActionDialog('send_notification')}
                    >
                      <Bell className="h-5 w-5 text-orange-500" />
                      <span>Bildirim Gönder</span>
                    </Button>
                  </div>

                  <Separator className="my-4" />

                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Kullanıcıyı Sil
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getActionTitle()}</DialogTitle>
            <DialogDescription>
              {selectedUser?.name || selectedUser?.email} için işlem yapın
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {(actionType === 'add_points' || actionType === 'remove_points') && (
              <>
                <div className="space-y-2">
                  <Label>Miktar</Label>
                  <Input
                    type="number"
                    value={pointsAmount}
                    onChange={(e) => setPointsAmount(parseInt(e.target.value) || 0)}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sebep (Opsiyonel)</Label>
                  <Input
                    value={pointsReason}
                    onChange={(e) => setPointsReason(e.target.value)}
                    placeholder="Örn: Özel kampanya ödülü"
                  />
                </div>
              </>
            )}

            {actionType === 'add_xp' && (
              <div className="space-y-2">
                <Label>XP Miktarı</Label>
                <Input
                  type="number"
                  value={xpAmount}
                  onChange={(e) => setXpAmount(parseInt(e.target.value) || 0)}
                  min={1}
                />
                <p className="text-xs text-muted-foreground">
                  Her 1000 XP = 1 Seviye
                </p>
              </div>
            )}

            {actionType === 'set_level' && (
              <div className="space-y-2">
                <Label>Yeni Seviye</Label>
                <Input
                  type="number"
                  value={newLevel}
                  onChange={(e) => setNewLevel(parseInt(e.target.value) || 1)}
                  min={1}
                  max={100}
                />
                <p className="text-xs text-muted-foreground">
                  Mevcut: Seviye {selectedUser?.level}
                </p>
              </div>
            )}

            {actionType === 'grant_badge' && (
              <div className="space-y-2">
                <Label>Rozet Seç</Label>
                <Select value={selectedBadgeId} onValueChange={setSelectedBadgeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Rozet seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allBadges.map((badge) => (
                      <SelectItem key={badge.id} value={badge.id}>
                        <div className="flex items-center gap-2">
                          <img src={badge.icon} alt={badge.name} className="w-5 h-5" />
                          <span>{badge.name}</span>
                          <Badge className={`text-xs ${rarityColors[badge.rarity as keyof typeof rarityColors]}`}>
                            {badge.rarity}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === 'grant_reward' && (
              <div className="space-y-2">
                <Label>Ödül Seç</Label>
                <Select value={selectedRewardId} onValueChange={setSelectedRewardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ödül seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allRewards.map((reward) => (
                      <SelectItem key={reward.id} value={reward.id}>
                        <div className="flex items-center gap-2">
                          <img src={reward.icon} alt={reward.name} className="w-5 h-5" />
                          <span>{reward.name}</span>
                          <span className="text-xs text-muted-foreground">({reward.cost} puan)</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Bu ödül ücretsiz olarak verilecek
                </p>
              </div>
            )}

            {actionType === 'send_notification' && (
              <>
                <div className="space-y-2">
                  <Label>Başlık</Label>
                  <Input
                    value={notificationTitle}
                    onChange={(e) => setNotificationTitle(e.target.value)}
                    placeholder="Bildirim başlığı"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mesaj</Label>
                  <Textarea
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    placeholder="Bildirim mesajı"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tür</Label>
                  <Select value={notificationType} onValueChange={(v) => setNotificationType(v as typeof notificationType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Bilgi</SelectItem>
                      <SelectItem value="success">Başarılı</SelectItem>
                      <SelectItem value="warning">Uyarı</SelectItem>
                      <SelectItem value="error">Hata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleAction} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                'Uygula'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Kullanıcı Ekle</DialogTitle>
            <DialogDescription>Yeni bir kullanıcı oluşturun. Email benzersiz olmalıdır.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>İsim</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ad Soyad"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@ornek.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Şifre (min 8 karakter)</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, role: v as typeof createForm.role }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOMER">Müşteri</SelectItem>
                  <SelectItem value="DEALER">Bayi</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.role === 'DEALER' && (
              <div className="space-y-2">
                <Label>İşletme Adı (Opsiyonel)</Label>
                <Input
                  value={createForm.businessName}
                  onChange={(e) => setCreateForm((p) => ({ ...p, businessName: e.target.value }))}
                  placeholder="İşletme adı"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>İptal</Button>
            <Button onClick={handleCreateUser} disabled={createLoading}>
              {createLoading ? 'Oluşturuluyor...' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcı Sil</DialogTitle>
            <DialogDescription>
              Bu kullanıcıyı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10">
              <Avatar>
                <AvatarImage src={selectedUser?.image || ''} />
                <AvatarFallback>{getInitials(selectedUser?.name || selectedUser?.email || '')}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedUser?.name || 'İsimsiz'}</p>
                <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              İptal
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
}
