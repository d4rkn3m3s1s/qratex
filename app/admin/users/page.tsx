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
import { DashboardHeader } from '@/components/dashboard/header';
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
import { toast } from 'sonner';
import { formatDate, getInitials } from '@/lib/utils';

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
  epic: 'bg-purple-500/10 text-purple-500',
  legendary: 'bg-yellow-500/10 text-yellow-500',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [allBadges, setAllBadges] = useState<BadgeType[]>([]);
  const [allRewards, setAllRewards] = useState<RewardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  
  // Dialogs
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [userBadges, setUserBadges] = useState<UserBadgeType[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<string>('');
  
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

  useEffect(() => {
    fetchUsers();
    fetchBadges();
    fetchRewards();
  }, [roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      
      if (res.ok && data.items) {
        setUsers(data.items);
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
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

  const handleOpenDetails = async (user: UserType) => {
    setSelectedUser(user);
    setNewLevel(user.level);
    await fetchUserBadges(user.id);
    setDetailsOpen(true);
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

  const filteredUsers = users.filter((user) =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: users.length,
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
    <div className="space-y-6">
      <DashboardHeader
        title="Kullanıcı Yönetimi"
        description="Tüm kullanıcıları görüntüleyin ve yönetin"
        actions={
          <Button onClick={fetchUsers} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Yenile
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
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
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
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
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
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
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
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
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İsim veya email ile ara..."
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
              <Table>
                <TableHeader>
                  <TableRow>
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
                            <Trophy className="h-4 w-4 text-purple-500" />
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
                                <Trophy className="h-4 w-4 mr-2 text-purple-500" />
                                Rozet Ver
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(user); openActionDialog('grant_reward'); }}>
                                <Gift className="h-4 w-4 mr-2 text-pink-500" />
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
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedUser && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedUser.image || ''} />
                    <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-purple-600 text-white">
                      {getInitials(selectedUser.name || selectedUser.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-xl">{selectedUser.name || 'İsimsiz'}</DialogTitle>
                    <DialogDescription>{selectedUser.email}</DialogDescription>
                    <Badge className={`mt-2 ${roleColors[selectedUser.role]}`}>
                      {React.createElement(roleIcons[selectedUser.role], { className: 'h-3 w-3 mr-1' })}
                      {roleLabels[selectedUser.role]}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Genel</TabsTrigger>
                  <TabsTrigger value="badges">Rozetler</TabsTrigger>
                  <TabsTrigger value="actions">İşlemler</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-4">
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
                    <div className="p-4 rounded-lg bg-purple-500/10 text-center">
                      <Zap className="h-6 w-6 text-purple-500 mx-auto mb-2" />
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
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
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
                      <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-2 gap-3">
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
                      <Trophy className="h-5 w-5 text-purple-500" />
                      <span>Rozet Ver</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2"
                      onClick={() => openActionDialog('grant_reward')}
                    >
                      <Gift className="h-5 w-5 text-pink-500" />
                      <span>Ödül Ver</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2 col-span-2"
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
    </div>
  );
}
