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
  Upload,
  Loader2,
} from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
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
import { toast } from '@/lib/admin-toast';

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  stock: number;
  type: string;
  metadata?: Record<string, unknown> | null;
  isActive: boolean;
  _count?: {
    users: number;
  };
}

const typeLabels: Record<string, string> = {
  physical: 'Fiziksel',
  digital: 'Dijital',
  coupon: 'Kupon',
};

const typeColors: Record<string, string> = {
  physical: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  digital: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  coupon: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '🎁',
    cost: 500,
    stock: 100,
    type: 'digital',
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

  const uploadIconFile = async (file: File) => {
    try {
      setIconUploading(true);
      const payload = new FormData();
      payload.append('folder', 'rewards');
      payload.append('file', file);

      const res = await fetch('/api/admin/assets/upload', {
        method: 'POST',
        body: payload,
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.path) {
        throw new Error(data?.error || 'Dosya yüklenemedi');
      }

      setFormData((prev) => ({ ...prev, icon: data.path as string }));
      toast.success('Ödül görseli yüklendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya yüklenemedi');
    } finally {
      setIconUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: '🎁',
      cost: 500,
      stock: 100,
      type: 'digital',
      isActive: true,
    });
  };

  const openEditDialog = (reward: Reward) => {
    setSelectedReward(reward);
    setFormData({
      name: reward.name,
      description: reward.description,
      icon: reward.icon || '🎁',
      cost: reward.cost || 500,
      stock: reward.stock,
      type: reward.type || 'digital',
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
    totalClaimed: rewards.reduce((acc, r) => acc + (r._count?.users || 0), 0),
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
        <Label>İkon (Emoji veya /images/... path)</Label>
        <Input
          value={formData.icon}
          onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
          placeholder="🎁 veya /images/badges/icon.svg"
        />
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept=".svg,.png,image/svg+xml,image/png"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadIconFile(file);
              e.currentTarget.value = '';
            }}
            className="cursor-pointer"
          />
          <div className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
            {iconUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {iconUploading ? 'Yükleniyor...' : 'Dosya Seç'}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">SVG veya PNG (maksimum 2MB) yükleyebilirsiniz.</p>
        {formData.icon?.startsWith('/') && (
          <div className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1">
            <Image src={formData.icon} alt="Yüklenen ödül görseli" width={28} height={28} className="rounded-sm" />
            <span className="text-xs text-muted-foreground truncate max-w-[220px]">{formData.icon}</span>
          </div>
        )}
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
              <SelectItem value="physical">Fiziksel</SelectItem>
              <SelectItem value="digital">Dijital</SelectItem>
              <SelectItem value="coupon">Kupon</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Puan Maliyeti</Label>
          <Input
            type="number"
            value={formData.cost}
            onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) || 0 })}
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

  const activeRewards = rewards.filter((r) => r.isActive);
  const poolMinCost = activeRewards.length > 0 ? Math.min(...activeRewards.map((r) => r.cost)) : 0;
  const poolMaxCost = activeRewards.length > 0 ? Math.max(...activeRewards.map((r) => r.cost)) : 0;

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Ödül Yönetimi"
        description="Ödül mağazası ürünlerini yönetin"
        icon={<Gift className="text-white" />}
      />

      {/* Ödül mantığı ve havuz rehberi */}
      <Card className="border-primary/20 bg-muted/30">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">Ödül mantığı</h3>
            <p className="text-xs text-muted-foreground">
              Sadece <strong>Aktif</strong> ödüller müşteri mağazasında listelenir. Stok 0 olan ödüller talep edilemez. Müşteri puanı &gt;= ödül maliyeti olduğunda talep edebilir; talep sonrası stok düşer (sınırsız stok için -1 girin).
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Ödül havuzu nasıl oluşturulur?</h3>
            <p className="text-xs text-muted-foreground">
              Yeni Ödül ile ekleyin → Puan maliyeti ve stok belirleyin → Aktif et. Havuz, aktif ödüllerin listesidir; müşteriler yalnızca bu listeyi görür. Puan eşiği her ödülün &quot;Puan Maliyeti&quot; alanıyla belirlenir.
            </p>
          </div>
          {activeRewards.length > 0 && (
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Havuz özeti: <strong>{activeRewards.length}</strong> aktif ödül, puan aralığı <strong>{poolMinCost.toLocaleString()}</strong> – <strong>{poolMaxCost.toLocaleString()}</strong>
            </p>
          )}
        </CardContent>
      </Card>

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
              transition={{ delay: Math.min(index, 10) * 0.05 }}
            >
              <Card glass hover className="group overflow-hidden">
                <CardContent className="p-0">
                  {/* Icon */}
                  <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/30">
                    {reward.icon?.startsWith('/') ? (
                      <Image
                        src={reward.icon}
                        alt={reward.name}
                        width={80}
                        height={80}
                        className="object-contain"
                      />
                    ) : (
                      <span className="text-5xl">{reward.icon || '🎁'}</span>
                    )}
                    <Badge className={`absolute top-2 right-2 ${typeColors[reward.type] || 'bg-gray-500/10 text-gray-500'}`}>
                      {typeLabels[reward.type] || reward.type}
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
                        <span className="font-bold">{(reward.cost || 0).toLocaleString()}</span>
                      </div>
                      <Badge variant={reward.stock > 10 ? 'outline' : reward.stock > 0 ? 'warning' : 'destructive'}>
                        Stok: {reward.stock}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {reward._count?.users || 0} kez talep edildi
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




