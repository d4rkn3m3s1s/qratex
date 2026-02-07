'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Plus,
  Search,
  Edit,
  Trash2,
  Star,
  Sparkles,
  Crown,
  Gem,
  Shield,
  Zap,
  Users,
  Filter,
  LayoutGrid,
  List,
  Target,
  Heart,
  Flame,
  Gift,
  Medal,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category?: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  points: number;
  requirement: string;
  isActive: boolean;
  _count?: {
    userBadges: number;
  };
}

const rarityConfig = {
  COMMON: {
    label: 'Yaygın',
    icon: Shield,
    gradient: 'from-slate-400 to-slate-600',
    bgGradient: 'bg-gradient-to-br from-slate-100 via-gray-50 to-slate-100 dark:from-slate-800/80 dark:via-slate-700/60 dark:to-slate-800/80',
    borderColor: 'border-gray-300 dark:border-gray-600/60',
    glowColor: 'shadow-gray-400/20 dark:shadow-gray-500/30',
    textColor: 'text-gray-600 dark:text-gray-400',
    badgeBg: 'bg-gray-200 dark:bg-gray-700/50',
  },
  RARE: {
    label: 'Nadir',
    icon: Gem,
    gradient: 'from-blue-400 to-cyan-500',
    bgGradient: 'bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 dark:from-blue-900/40 dark:via-cyan-900/30 dark:to-blue-800/40',
    borderColor: 'border-blue-300 dark:border-blue-500/50',
    glowColor: 'shadow-blue-400/20 dark:shadow-blue-500/30',
    textColor: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-800/40',
  },
  EPIC: {
    label: 'Epik',
    icon: Zap,
    gradient: 'from-purple-400 to-pink-500',
    bgGradient: 'bg-gradient-to-br from-purple-50 via-pink-50 to-fuchsia-100 dark:from-purple-900/40 dark:via-pink-900/30 dark:to-fuchsia-900/40',
    borderColor: 'border-purple-300 dark:border-purple-500/50',
    glowColor: 'shadow-purple-400/20 dark:shadow-purple-500/30',
    textColor: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-100 dark:bg-purple-800/40',
  },
  LEGENDARY: {
    label: 'Efsanevi',
    icon: Crown,
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    bgGradient: 'bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-red-900/40',
    borderColor: 'border-amber-300 dark:border-yellow-500/50',
    glowColor: 'shadow-yellow-400/30 dark:shadow-yellow-500/50',
    textColor: 'text-amber-600 dark:text-yellow-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-800/40',
  },
};

const categoryOptions = [
  { value: 'feedback', label: 'Geri Bildirim', icon: Target },
  { value: 'engagement', label: 'Etkileşim', icon: Heart },
  { value: 'streak', label: 'Seri', icon: Flame },
  { value: 'special', label: 'Özel', icon: Gift },
  { value: 'general', label: 'Genel', icon: Medal },
];

const badgeIcons = [
  '/images/badges/EFSANE.svg',
  '/images/badges/MÜCEVHER.svg',
  '/images/badges/FLASH.svg',
  '/images/badges/JOKER.svg',
  '/images/badges/SHERLOCK.svg',
  '/images/badges/JON SNOW.svg',
  '/images/badges/WALTER WHİTE.svg',
  '/images/badges/SHELDON COOPER.svg',
  '/images/badges/PROFESSOR.svg',
  '/images/badges/MR ROBOT.svg',
];

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeType | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: badgeIcons[0],
    category: 'general',
    rarity: 'COMMON' as BadgeType['rarity'],
    points: 100,
    requirement: '',
    isActive: true,
  });

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/badges');
      const data = await res.json();
      
      if (data.success) {
        setBadges(data.data);
      }
    } catch (error) {
      toast.error('Rozetler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/gamification/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        toast.success('Rozet oluşturuldu');
        setCreateDialogOpen(false);
        resetForm();
        fetchBadges();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Rozet oluşturulamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleUpdate = async () => {
    if (!selectedBadge) return;
    
    try {
      const res = await fetch(`/api/gamification/badges/${selectedBadge.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        toast.success('Rozet güncellendi');
        setEditDialogOpen(false);
        setSelectedBadge(null);
        resetForm();
        fetchBadges();
      } else {
        toast.error('Rozet güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gamification/badges/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('Rozet silindi');
        fetchBadges();
      } else {
        toast.error('Rozet silinemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: badgeIcons[0],
      category: 'general',
      rarity: 'COMMON',
      points: 100,
      requirement: '',
      isActive: true,
    });
  };

  const openEditDialog = (badge: BadgeType) => {
    setSelectedBadge(badge);
    setFormData({
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      category: badge.category || 'general',
      rarity: badge.rarity,
      points: badge.points,
      requirement: badge.requirement,
      isActive: badge.isActive,
    });
    setEditDialogOpen(true);
  };

  const filteredBadges = badges.filter((badge) => {
    const matchesSearch = badge.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRarity = filterRarity === 'all' || badge.rarity === filterRarity;
    return matchesSearch && matchesRarity;
  });

  // Stats
  const stats = {
    total: badges.length,
    legendary: badges.filter(b => b.rarity === 'LEGENDARY').length,
    epic: badges.filter(b => b.rarity === 'EPIC').length,
    rare: badges.filter(b => b.rarity === 'RARE').length,
    common: badges.filter(b => b.rarity === 'COMMON').length,
  };

  const BadgeForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rozet Adı</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Örn: İlk Adım"
        />
      </div>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Rozet açıklaması..."
        />
      </div>
      <div className="space-y-2">
        <Label>İkon</Label>
        <div className="flex flex-wrap gap-3 p-4 rounded-lg bg-muted/50 border border-border">
          {badgeIcons.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => setFormData({ ...formData, icon })}
              className={`p-2.5 rounded-xl border-2 transition-all ${
                formData.icon === icon
                  ? 'border-primary bg-primary/10 scale-110 shadow-lg'
                  : 'border-transparent hover:border-primary/30 hover:bg-muted'
              }`}
            >
              <Image src={icon} alt="Badge" width={48} height={48} className="drop-shadow-lg" />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kategori</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <span className="flex items-center gap-2">
                    <cat.icon className="h-4 w-4 text-muted-foreground" />
                    {cat.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nadirlik</Label>
          <Select
            value={formData.rarity}
            onValueChange={(value) => setFormData({ ...formData, rarity: value as BadgeType['rarity'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(rarityConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <config.icon className={`h-4 w-4 ${config.textColor}`} />
                    {config.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Puan Ödülü</Label>
          <Input
            type="number"
            value={formData.points}
            onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Gereksinim</Label>
          <Input
            value={formData.requirement}
            onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
            placeholder="Örn: 10 geri bildirim gönder"
          />
        </div>
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
        <Label>Aktif</Label>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => {
          setCreateDialogOpen(false);
          setEditDialogOpen(false);
          resetForm();
        }}>
          İptal
        </Button>
        <Button onClick={onSubmit} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Rozet Yönetimi"
        description="Gamification rozetlerini oluşturun ve yönetin"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-card border border-border"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-muted">
              <Trophy className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Toplam</p>
            </div>
          </div>
        </motion.div>
        
        {Object.entries(rarityConfig).map(([key, config], index) => {
          const count = stats[key.toLowerCase() as keyof typeof stats] || 0;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (index + 1) * 0.1 }}
              className={`p-4 rounded-xl ${config.bgGradient} border ${config.borderColor}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${config.badgeBg}`}>
                  <config.icon className={`h-5 w-5 ${config.textColor}`} />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{count}</p>
                  <p className={`text-xs ${config.textColor}`}>{config.label}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rozet ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterRarity} onValueChange={setFilterRarity}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrele" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              {Object.entries(rarityConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <config.icon className={`h-4 w-4 ${config.textColor}`} />
                    {config.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1 p-1 rounded-lg bg-muted border border-border">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white">
              <Plus className="h-4 w-4" />
              Yeni Rozet Oluştur
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Yeni Rozet Oluştur
              </DialogTitle>
              <DialogDescription>
                Kullanıcıların kazanabileceği yeni bir rozet oluşturun. Özel rozetler için &quot;Özel&quot; kategorisini seçin.
              </DialogDescription>
            </DialogHeader>
            <BadgeForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Badges Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-8 rounded-2xl bg-card border">
              <div className="animate-pulse space-y-5">
                <div className="w-24 h-24 bg-muted rounded-full mx-auto" />
                <div className="h-5 bg-muted rounded w-3/4 mx-auto" />
                <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBadges.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-16 rounded-2xl bg-card border text-center"
        >
          <Trophy className="h-20 w-20 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground text-lg font-medium">Rozet bulunamadı</p>
          <p className="text-muted-foreground text-sm mt-1">Yeni bir rozet oluşturmaya başlayın</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={viewMode === 'grid' 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" 
              : "space-y-3"
            }
          >
            {filteredBadges.map((badge, index) => {
              const config = rarityConfig[badge.rarity];
              const RarityIcon = config.icon;
              
              if (viewMode === 'list') {
                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`flex items-center gap-4 p-4 rounded-xl ${config.bgGradient} border ${config.borderColor} hover:scale-[1.01] transition-transform group`}
                  >
                    <div className={`relative p-3 rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg ${config.glowColor}`}>
                      <Image
                        src={badge.icon}
                        alt={badge.name}
                        width={48}
                        height={48}
                        className="drop-shadow-lg"
                      />
                      {badge.rarity === 'LEGENDARY' && (
                        <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-amber-400 animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{badge.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{badge.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${config.badgeBg} ${config.textColor} border-0`}>
                        <RarityIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:text-amber-300">
                        <Star className="h-3 w-3" />
                        {badge.points}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {badge._count?.userBadges || 0}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(badge)} className="hover:bg-muted">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(badge.id)} className="hover:bg-destructive/10 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <div className={`relative p-8 rounded-2xl ${config.bgGradient} border-2 ${config.borderColor} overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl ${config.glowColor}`}>
                    {/* Animated background for legendary */}
                    {badge.rarity === 'LEGENDARY' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 animate-pulse" />
                    )}
                    
                    {/* Glow effect */}
                    <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br ${config.gradient} opacity-10 dark:opacity-20 blur-3xl`} />
                    
                    <div className="relative flex flex-col items-center text-center space-y-4">
                      {/* Badge Icon - DIRECT */}
                      <div className="relative">
                        <div className={`absolute inset-4 rounded-full bg-gradient-to-br ${config.gradient} blur-2xl opacity-20 dark:opacity-40`} />
                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={96}
                            height={96}
                            className="relative z-10 drop-shadow-2xl brightness-110 dark:brightness-125"
                          />
                        {badge.rarity === 'LEGENDARY' && (
                          <motion.div
                            className="absolute -top-2 -right-2"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          >
                            <Sparkles className="h-7 w-7 text-amber-400 drop-shadow-lg" />
                          </motion.div>
                        )}
                        {badge.rarity === 'EPIC' && (
                          <Zap className="absolute -top-1 -right-1 h-6 w-6 text-purple-500 dark:text-purple-300 animate-pulse" />
                        )}
                      </div>

                      {/* Badge Info */}
                      <div className="space-y-2">
                        <h3 className="font-bold text-lg text-foreground">{badge.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{badge.description}</p>
                      </div>

                      {/* Rarity & Points */}
                      <div className="flex items-center gap-2">
                        <Badge className={`${config.badgeBg} ${config.textColor} border-0 font-medium`}>
                          <RarityIcon className="h-3.5 w-3.5 mr-1" />
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:text-amber-300 font-medium">
                          <Star className="h-3.5 w-3.5 fill-amber-400 dark:fill-amber-300" />
                          {badge.points}
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{badge._count?.userBadges || 0} kullanıcı kazandı</span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditDialog(badge)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Düzenle
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(badge.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Status indicator */}
                    {!badge.isActive && (
                      <div className="absolute top-3 right-3">
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Pasif
                        </Badge>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-purple-500" />
              Rozet Düzenle
            </DialogTitle>
            <DialogDescription>
              {selectedBadge?.name} rozetini düzenleyin
            </DialogDescription>
          </DialogHeader>
          <BadgeForm onSubmit={handleUpdate} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
