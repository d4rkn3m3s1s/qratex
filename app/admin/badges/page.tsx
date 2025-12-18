'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Trophy,
  Plus,
  Search,
  Edit,
  Trash2,
  Star,
  Sparkles,
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
import { getRarityColor, getRarityBgColor } from '@/lib/utils';

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

const rarityLabels = {
  COMMON: 'Yaygın',
  RARE: 'Nadir',
  EPIC: 'Epik',
  LEGENDARY: 'Efsanevi',
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

  const filteredBadges = badges.filter((badge) =>
    badge.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <div className="flex flex-wrap gap-2">
          {badgeIcons.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => setFormData({ ...formData, icon })}
              className={`p-2 rounded-lg border-2 transition-colors ${
                formData.icon === icon
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Image src={icon} alt="Badge" width={40} height={40} />
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMMON">Yaygın</SelectItem>
              <SelectItem value="RARE">Nadir</SelectItem>
              <SelectItem value="EPIC">Epik</SelectItem>
              <SelectItem value="LEGENDARY">Efsanevi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Puan</Label>
          <Input
            type="number"
            value={formData.points}
            onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Gereksinim</Label>
        <Input
          value={formData.requirement}
          onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
          placeholder="Örn: 10 geri bildirim gönder"
        />
      </div>
      <div className="flex items-center justify-between">
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
        <Button onClick={onSubmit}>{submitLabel}</Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Rozet Yönetimi"
        description="Gamification rozetlerini oluşturun ve yönetin"
      />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rozet ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Rozet
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Yeni Rozet Oluştur</DialogTitle>
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
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="w-16 h-16 bg-muted rounded-full mx-auto" />
                  <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                  <div className="h-3 bg-muted rounded w-1/2 mx-auto" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBadges.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Rozet bulunamadı</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBadges.map((badge, index) => (
            <motion.div
              key={badge.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card glass hover className="relative overflow-hidden group">
                {badge.rarity === 'LEGENDARY' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 animate-gradient-x" />
                )}
                <CardContent className="p-6 relative">
                  <div className="flex flex-col items-center text-center space-y-3">
                    {/* Badge Icon */}
                    <div className={`relative p-4 rounded-full border-2 border-white/20 shadow-lg ${getRarityBgColor(badge.rarity)}`}>
                      <Image
                        src={badge.icon}
                        alt={badge.name}
                        width={48}
                        height={48}
                        className="relative z-10 drop-shadow-lg"
                        style={{ filter: 'brightness(1.1) contrast(1.1)' }}
                      />
                      {badge.rarity === 'LEGENDARY' && (
                        <Sparkles className="absolute top-0 right-0 h-4 w-4 text-yellow-500 animate-pulse" />
                      )}
                    </div>

                    {/* Badge Info */}
                    <div>
                      <h3 className="font-semibold">{badge.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{badge.description}</p>
                    </div>

                    {/* Rarity & Points */}
                    <div className="flex items-center gap-2">
                      <Badge className={getRarityColor(badge.rarity)}>
                        {rarityLabels[badge.rarity]}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <Star className="h-3 w-3" />
                        {badge.points}
                      </Badge>
                    </div>

                    {/* Stats */}
                    <p className="text-xs text-muted-foreground">
                      {badge._count?.userBadges || 0} kullanıcı kazandı
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(badge)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(badge.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rozet Düzenle</DialogTitle>
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

