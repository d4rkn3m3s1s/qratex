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
    bgGradient: 'from-slate-500/20 to-slate-700/20',
    borderColor: 'border-slate-500/50',
    glowColor: 'shadow-slate-500/20',
    textColor: 'text-slate-300',
    badgeBg: 'bg-slate-500/30',
  },
  RARE: {
    label: 'Nadir',
    icon: Gem,
    gradient: 'from-blue-400 to-cyan-500',
    bgGradient: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/50',
    glowColor: 'shadow-blue-500/30',
    textColor: 'text-blue-300',
    badgeBg: 'bg-blue-500/30',
  },
  EPIC: {
    label: 'Epik',
    icon: Zap,
    gradient: 'from-purple-400 to-pink-500',
    bgGradient: 'from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-500/50',
    glowColor: 'shadow-purple-500/30',
    textColor: 'text-purple-300',
    badgeBg: 'bg-purple-500/30',
  },
  LEGENDARY: {
    label: 'Efsanevi',
    icon: Crown,
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    bgGradient: 'from-amber-500/20 via-orange-500/20 to-red-500/20',
    borderColor: 'border-amber-500/50',
    glowColor: 'shadow-amber-500/40',
    textColor: 'text-amber-300',
    badgeBg: 'bg-gradient-to-r from-amber-500/30 to-red-500/30',
  },
};

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
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-black/20 border border-white/10">
          {badgeIcons.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => setFormData({ ...formData, icon })}
              className={`p-2 rounded-lg border-2 transition-all ${
                formData.icon === icon
                  ? 'border-primary bg-primary/20 scale-110'
                  : 'border-transparent hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <Image src={icon} alt="Badge" width={40} height={40} className="drop-shadow-lg" />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nadirlik</Label>
          <Select
            value={formData.rarity}
            onValueChange={(value) => setFormData({ ...formData, rarity: value as BadgeType['rarity'] })}
          >
            <SelectTrigger className="bg-black/20 border-white/10">
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
        <div className="space-y-2">
          <Label>Puan</Label>
          <Input
            type="number"
            value={formData.points}
            onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
            className="bg-black/20 border-white/10"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Gereksinim</Label>
        <Input
          value={formData.requirement}
          onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
          placeholder="Örn: 10 geri bildirim gönder"
          className="bg-black/20 border-white/10"
        />
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/10">
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20">
              <Trophy className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-slate-400">Toplam</p>
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
              className={`p-4 rounded-xl bg-gradient-to-br ${config.bgGradient} border ${config.borderColor}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.badgeBg}`}>
                  <config.icon className={`h-5 w-5 ${config.textColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{count}</p>
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
              className="pl-10 bg-black/20 border-white/10"
            />
          </div>
          <Select value={filterRarity} onValueChange={setFilterRarity}>
            <SelectTrigger className="w-[180px] bg-black/20 border-white/10">
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
          <div className="flex gap-1 p-1 rounded-lg bg-black/20 border border-white/10">
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
            <Button className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <Plus className="h-4 w-4" />
              Yeni Rozet
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 to-slate-950 border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                Yeni Rozet Oluştur
              </DialogTitle>
              <DialogDescription>
                Kullanıcıların kazanabileceği yeni bir rozet oluşturun
              </DialogDescription>
            </DialogHeader>
            <BadgeForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Badges Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-6 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50">
              <div className="animate-pulse space-y-4">
                <div className="w-20 h-20 bg-slate-700/50 rounded-full mx-auto" />
                <div className="h-4 bg-slate-700/50 rounded w-3/4 mx-auto" />
                <div className="h-3 bg-slate-700/50 rounded w-1/2 mx-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBadges.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-12 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 text-center"
        >
          <Trophy className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Rozet bulunamadı</p>
          <p className="text-slate-500 text-sm mt-1">Yeni bir rozet oluşturmaya başlayın</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={viewMode === 'grid' 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" 
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
                    className={`flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${config.bgGradient} border ${config.borderColor} hover:scale-[1.01] transition-transform group`}
                  >
                    <div className={`relative p-3 rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg ${config.glowColor}`}>
                      <Image
                        src={badge.icon}
                        alt={badge.name}
                        width={40}
                        height={40}
                        className="drop-shadow-lg"
                      />
                      {badge.rarity === 'LEGENDARY' && (
                        <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-amber-300 animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">{badge.name}</h3>
                      <p className="text-sm text-slate-400 truncate">{badge.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${config.badgeBg} ${config.textColor} border-0`}>
                        <RarityIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-300">
                        <Star className="h-3 w-3" />
                        {badge.points}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Users className="h-4 w-4" />
                      {badge._count?.userBadges || 0}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(badge)} className="hover:bg-white/10">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(badge.id)} className="hover:bg-red-500/20 text-red-400">
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
                  <div className={`relative p-6 rounded-2xl bg-gradient-to-br ${config.bgGradient} border-2 ${config.borderColor} overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${config.glowColor}`}>
                    {/* Animated background for legendary */}
                    {badge.rarity === 'LEGENDARY' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 animate-pulse" />
                    )}
                    
                    {/* Glow effect */}
                    <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br ${config.gradient} opacity-20 blur-3xl`} />
                    
                    <div className="relative flex flex-col items-center text-center space-y-4">
                      {/* Badge Icon Container */}
                      <div className="relative">
                        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${config.gradient} blur-xl opacity-50`} />
                        <div className={`relative p-4 rounded-full bg-gradient-to-br ${config.gradient} shadow-2xl ${config.glowColor}`}>
                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={56}
                            height={56}
                            className="relative z-10 drop-shadow-2xl"
                          />
                        </div>
                        {badge.rarity === 'LEGENDARY' && (
                          <motion.div
                            className="absolute -top-1 -right-1"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          >
                            <Sparkles className="h-5 w-5 text-amber-300 drop-shadow-lg" />
                          </motion.div>
                        )}
                        {badge.rarity === 'EPIC' && (
                          <Zap className="absolute -top-1 -right-1 h-5 w-5 text-purple-300 animate-pulse" />
                        )}
                      </div>

                      {/* Badge Info */}
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg text-white">{badge.name}</h3>
                        <p className="text-sm text-slate-300 line-clamp-2">{badge.description}</p>
                      </div>

                      {/* Rarity & Points */}
                      <div className="flex items-center gap-2">
                        <Badge className={`${config.badgeBg} ${config.textColor} border-0 font-medium`}>
                          <RarityIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-300 font-medium">
                          <Star className="h-3 w-3 fill-amber-300" />
                          {badge.points}
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-1 text-sm text-slate-400">
                        <Users className="h-4 w-4" />
                        <span>{badge._count?.userBadges || 0} kullanıcı kazandı</span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditDialog(badge)}
                          className="bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Düzenle
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-300 backdrop-blur-sm"
                          onClick={() => handleDelete(badge.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Status indicator */}
                    {!badge.isActive && (
                      <div className="absolute top-3 right-3">
                        <Badge variant="outline" className="bg-black/50 text-slate-400 border-slate-600">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 to-slate-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-purple-400" />
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
