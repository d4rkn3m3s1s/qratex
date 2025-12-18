'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Gift,
  Plus,
  Search,
  Edit,
  Trash2,
  Star,
  Package,
  ShoppingBag,
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

interface Reward {
  id: string;
  name: string;
  description: string;
  image: string | null;
  pointsCost: number;
  stock: number;
  type: 'PHYSICAL' | 'DIGITAL' | 'COUPON' | 'VIP';
  isActive: boolean;
  _count?: {
    userRewards: number;
  };
}

const typeLabels = {
  PHYSICAL: 'Fiziksel',
  DIGITAL: 'Dijital',
  COUPON: 'Kupon',
  VIP: 'VIP',
};

const typeColors = {
  PHYSICAL: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  DIGITAL: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  COUPON: 'bg-green-500/10 text-green-500 border-green-500/20',
  VIP: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    pointsCost: 500,
    stock: 100,
    type: 'DIGITAL' as Reward['type'],
    isActive: true,
  });

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/rewards');
      const data = await res.json();
      
      if (data.success) {
        setRewards(data.data);
      }
    } catch (error) {
      toast.error('Ödüller yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/gamification/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        toast.success('Ödül oluşturuldu');
        setCreateDialogOpen(false);
        resetForm();
        fetchRewards();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Ödül oluşturulamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleUpdate = async () => {
    if (!selectedReward) return;
    
    try {
      const res = await fetch(`/api/gamification/rewards/${selectedReward.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        toast.success('Ödül güncellendi');
        setEditDialogOpen(false);
        setSelectedReward(null);
        resetForm();
        fetchRewards();
      } else {
        toast.error('Ödül güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gamification/rewards/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('Ödül silindi');
        fetchRewards();
      } else {
        toast.error('Ödül silinemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      image: '',
      pointsCost: 500,
      stock: 100,
      type: 'DIGITAL',
      isActive: true,
    });
  };

  const openEditDialog = (reward: Reward) => {
    setSelectedReward(reward);
    setFormData({
      name: reward.name,
      description: reward.description,
      image: reward.image || '',
      pointsCost: reward.pointsCost,
      stock: reward.stock,
      type: reward.type,
      isActive: reward.isActive,
    });
    setEditDialogOpen(true);
  };

  const filteredRewards = rewards.filter((reward) =>
    reward.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: rewards.length,
    active: rewards.filter((r) => r.isActive).length,
    totalClaimed: rewards.reduce((acc, r) => acc + (r._count?.userRewards || 0), 0),
    lowStock: rewards.filter((r) => r.stock < 10 && r.stock > 0).length,
  };

  const RewardForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Ödül Adı</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Örn: Premium Üyelik"
        />
      </div>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Ödül açıklaması..."
        />
      </div>
      <div className="space-y-2">
        <Label>Görsel URL (Opsiyonel)</Label>
        <Input
          value={formData.image}
          onChange={(e) => setFormData({ ...formData, image: e.target.value })}
          placeholder="https://..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tür</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => setFormData({ ...formData, type: value as Reward['type'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PHYSICAL">Fiziksel</SelectItem>
              <SelectItem value="DIGITAL">Dijital</SelectItem>
              <SelectItem value="COUPON">Kupon</SelectItem>
              <SelectItem value="VIP">VIP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Puan Maliyeti</Label>
          <Input
            type="number"
            value={formData.pointsCost}
            onChange={(e) => setFormData({ ...formData, pointsCost: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Stok</Label>
        <Input
          type="number"
          value={formData.stock}
          onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
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
        title="Ödül Yönetimi"
        description="Ödül mağazası ürünlerini yönetin"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Toplam Ödül</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Package className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <ShoppingBag className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalClaimed}</p>
                <p className="text-xs text-muted-foreground">Talep Edilen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.lowStock}</p>
                <p className="text-xs text-muted-foreground">Düşük Stok</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ödül ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Ödül
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Ödül Oluştur</DialogTitle>
              <DialogDescription>
                Ödül mağazasına yeni bir ürün ekleyin
              </DialogDescription>
            </DialogHeader>
            <RewardForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Rewards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="w-full h-32 bg-muted rounded-lg" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredRewards.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center">
            <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Ödül bulunamadı</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRewards.map((reward, index) => (
            <motion.div
              key={reward.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card glass hover className="group overflow-hidden">
                <CardContent className="p-0">
                  {/* Image */}
                  <div className="relative h-32 bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                    {reward.image ? (
                      <Image
                        src={reward.image}
                        alt={reward.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <Gift className="h-12 w-12 text-primary/50" />
                    )}
                    <Badge className={`absolute top-2 right-2 ${typeColors[reward.type]}`}>
                      {typeLabels[reward.type]}
                    </Badge>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold">{reward.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{reward.description}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Star className="h-4 w-4 fill-yellow-500" />
                        <span className="font-bold">{reward.pointsCost.toLocaleString()}</span>
                      </div>
                      <Badge variant={reward.stock > 10 ? 'outline' : reward.stock > 0 ? 'warning' : 'destructive'}>
                        Stok: {reward.stock}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {reward._count?.userRewards || 0} kez talep edildi
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openEditDialog(reward)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Düzenle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(reward.id)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödül Düzenle</DialogTitle>
            <DialogDescription>
              {selectedReward?.name} ödülünü düzenleyin
            </DialogDescription>
          </DialogHeader>
          <RewardForm onSubmit={handleUpdate} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

