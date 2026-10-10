'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { m as Motion } from 'framer-motion';
import { Gift, Plus, Search, Edit, Trash2, Star, Package, ShoppingBag } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { ConfirmAction, QueryState, StatTile, TONE_CHIP, type Tone } from '@/components/states';
import { RewardForm } from './reward-form';
import {
  REWARD_TYPE_LABELS,
  initialRewardForm,
  isImageIcon,
  isRewardType,
  rewardToFormValues,
  toRewardPayload,
  validateRewardPayload,
  type RewardFormValues,
} from './reward-form-model';

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

const TYPE_TONES: Record<keyof typeof REWARD_TYPE_LABELS, Tone> = {
  physical: 'warning',
  digital: 'info',
  coupon: 'success',
};

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

function errorMessage(data: Record<string, unknown> | null, fallback: string): string {
  return typeof data?.error === 'string' && data.error ? data.error : fallback;
}

function stockLabel(stock: number): string {
  return stock < 0 ? 'Sınırsız' : String(stock);
}

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [formData, setFormData] = useState<RewardFormValues>(initialRewardForm);

  const fetchRewards = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/gamification/rewards', { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok || !data?.success) throw new Error(errorMessage(data, 'Ödüller yüklenemedi'));
      setRewards(Array.isArray(data.data) ? (data.data as Reward[]) : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error('Ödüller yüklenemedi'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRewards();
  }, [fetchRewards]);

  const resetForm = () => setFormData(initialRewardForm);

  const closeDialogs = () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedReward(null);
    resetForm();
  };

  const submit = async (mode: 'create' | 'update') => {
    if (mode === 'update' && !selectedReward) return;
    const payload = toRewardPayload(formData);
    const invalid = validateRewardPayload(payload);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        mode === 'create'
          ? '/api/gamification/rewards'
          : `/api/gamification/rewards/${encodeURIComponent(selectedReward!.id)}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await readJson(res);
      if (!res.ok || data?.success === false) {
        throw new Error(errorMessage(data, mode === 'create' ? 'Ödül oluşturulamadı' : 'Ödül güncellenemedi'));
      }
      toast.success(mode === 'create' ? 'Ödül oluşturuldu' : 'Ödül güncellendi');
      closeDialogs();
      await fetchRewards();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  /** ConfirmAction içinden: hata fırlatırsa diyalog açık kalır ve hata gösterilir. */
  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/gamification/rewards/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok || data?.success === false) throw new Error(errorMessage(data, 'Ödül kaldırılamadı'));
    toast.success('Ödül kaldırıldı');
    await fetchRewards();
  };

  const uploadIconFile = async (file: File) => {
    setIconUploading(true);
    try {
      const payload = new FormData();
      payload.append('folder', 'rewards');
      payload.append('file', file);
      const res = await fetch('/api/admin/assets/upload', { method: 'POST', body: payload });
      const data = await readJson(res);
      const url = typeof data?.url === 'string' ? data.url : typeof data?.path === 'string' ? data.path : null;
      if (!res.ok || !data?.success || !url) throw new Error(errorMessage(data, 'Dosya yüklenemedi'));
      setFormData((prev) => ({ ...prev, icon: url }));
      toast.success('Ödül görseli yüklendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya yüklenemedi');
    } finally {
      setIconUploading(false);
    }
  };

  const openEditDialog = (reward: Reward) => {
    setSelectedReward(reward);
    setFormData(rewardToFormValues(reward));
    setEditDialogOpen(true);
  };

  const filteredRewards = useMemo(() => {
    if (!rewards) return null;
    const q = searchQuery.toLocaleLowerCase('tr-TR').trim();
    if (!q) return rewards;
    return rewards.filter((reward) => reward.name.toLocaleLowerCase('tr-TR').includes(q));
  }, [rewards, searchQuery]);

  const all = rewards ?? [];
  const activeRewards = all.filter((r) => r.isActive);
  const stats = {
    total: all.length,
    active: activeRewards.length,
    totalClaimed: all.reduce((acc, r) => acc + (r._count?.users || 0), 0),
    lowStock: all.filter((r) => r.stock < 10 && r.stock > 0).length,
  };
  const poolMinCost = activeRewards.length > 0 ? Math.min(...activeRewards.map((r) => r.cost)) : 0;
  const poolMaxCost = activeRewards.length > 0 ? Math.max(...activeRewards.map((r) => r.cost)) : 0;
  const searching = searchQuery.trim().length > 0;

  const formProps = {
    value: formData,
    onChange: setFormData,
    onCancel: closeDialogs,
    onUploadIcon: (file: File) => void uploadIconFile(file),
    iconUploading,
    saving,
  };

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Ödül Yönetimi"
        description="Ödül mağazası ürünlerini yönetin"
        icon={<Gift className="text-white" />}
      />

      {/* Ödül mantığı ve havuz rehberi */}
      <Card className="border-primary/20 bg-muted/30">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Ödül mantığı</h3>
            <p className="text-xs text-muted-foreground">
              Yalnız <strong>Aktif</strong> ödüller müşteri mağazasında listelenir. Stok 0 olan ödüller talep edilemez. Müşteri
              puanı ödül maliyetine eşit ya da fazla olduğunda talep edebilir; talep sonrası stok düşer (sınırsız stok için -1
              girin).
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Ödül havuzu nasıl oluşturulur?</h3>
            <p className="text-xs text-muted-foreground">
              “Yeni Ödül” ile ekleyin → puan maliyeti ve stok belirleyin → aktif edin. Havuz, aktif ödüllerin listesidir;
              müşteriler yalnız bu listeyi görür. Puan eşiği her ödülün “Puan maliyeti” alanıyla belirlenir.
            </p>
          </div>
          {activeRewards.length > 0 && (
            <p className="border-t pt-2 text-xs text-muted-foreground">
              Havuz özeti: <strong>{activeRewards.length}</strong> aktif ödül, puan aralığı{' '}
              <strong>{poolMinCost.toLocaleString('tr-TR')}</strong> – <strong>{poolMaxCost.toLocaleString('tr-TR')}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Toplam ödül" value={stats.total} icon={<Gift className="h-4 w-4" />} loading={loading && !rewards} />
        <StatTile label="Aktif" value={stats.active} icon={<Package className="h-4 w-4" />} tone="success" loading={loading && !rewards} />
        <StatTile label="Talep edilen" value={stats.totalClaimed} icon={<ShoppingBag className="h-4 w-4" />} tone="info" loading={loading && !rewards} />
        <StatTile label="Düşük stok" value={stats.lowStock} icon={<Star className="h-4 w-4" />} tone="warning" loading={loading && !rewards} />
      </div>

      {/* Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Ödül ara..."
            aria-label="Ödül ara"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            if (open) resetForm();
            setCreateDialogOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Yeni Ödül
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Yeni Ödül Oluştur</DialogTitle>
              <DialogDescription>Ödül mağazasına yeni bir ürün ekleyin</DialogDescription>
            </DialogHeader>
            <RewardForm idPrefix="reward-create" {...formProps} onSubmit={() => void submit('create')} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Rewards Grid */}
      <QueryState
        query={{ data: filteredRewards, error: loadError, isLoading: loading && !rewards, refetch: fetchRewards }}
        skeleton="cards"
        loadingLabel="Ödüller yükleniyor"
        empty={
          searching
            ? { variant: 'no-results', title: 'Aramanızla eşleşen ödül yok', description: 'Farklı bir ödül adı deneyin.' }
            : { variant: 'first-use', title: 'Henüz ödül yok', description: '“Yeni Ödül” ile mağazaya ilk ürünü ekleyin.' }
        }
      >
        {(list) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((reward, index) => {
              const typeKey = isRewardType(reward.type) ? reward.type : null;
              const claimed = reward._count?.users || 0;
              return (
                <Motion.div
                  key={reward.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(index, 10) * 0.05 }}
                >
                  <Card glass hover className="group overflow-hidden">
                    <CardContent className="p-0">
                      {/* Icon */}
                      <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/30">
                        {isImageIcon(reward.icon) ? (
                          <Image src={reward.icon} alt={reward.name} width={80} height={80} className="object-contain" />
                        ) : (
                          <span className="text-5xl" aria-hidden>
                            {reward.icon || '🎁'}
                          </span>
                        )}
                        <Badge
                          className={`absolute right-2 top-2 border-transparent ${TONE_CHIP[typeKey ? TYPE_TONES[typeKey] : 'neutral']}`}
                        >
                          {typeKey ? REWARD_TYPE_LABELS[typeKey] : reward.type}
                        </Badge>
                      </div>

                      {/* Content */}
                      <div className="space-y-3 p-4">
                        <div>
                          <h3 className="font-semibold">{reward.name}</h3>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{reward.description}</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-warning">
                            <Star className="h-4 w-4 fill-current" aria-hidden />
                            <span className="font-bold tabular-nums">{(reward.cost || 0).toLocaleString('tr-TR')}</span>
                          </div>
                          <Badge
                            variant={reward.stock < 0 || reward.stock > 10 ? 'outline' : reward.stock > 0 ? 'warning' : 'destructive'}
                          >
                            Stok: {stockLabel(reward.stock)}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{claimed} kez talep edildi</span>
                          {!reward.isActive ? <Badge variant="secondary">Pasif</Badge> : null}
                        </div>

                        {/* Actions — her zaman görünür (dokunmatikte görünmez-ama-tıklanabilir buton yok) */}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditDialog(reward)}>
                            <Edit className="mr-2 h-4 w-4" aria-hidden />
                            Düzenle
                          </Button>
                          <ConfirmAction
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                aria-label={`${reward.name} ödülünü kaldır`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            }
                            title="Ödül kaldırılsın mı?"
                            description="Ödül mağazadan kalkar; müşteriler artık talep edemez."
                            impact={[
                              { label: 'Ödül', value: reward.name },
                              { label: 'Talep sayısı', value: claimed, emphasis: claimed > 0 },
                            ]}
                            confirmPhrase={claimed > 0 ? reward.name : undefined}
                            confirmLabel="Ödülü kaldır"
                            onConfirm={() => handleDelete(reward.id)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Motion.div>
              );
            })}
          </div>
        )}
      </QueryState>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialogs();
          else setEditDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ödül Düzenle</DialogTitle>
            <DialogDescription>{selectedReward?.name} ödülünü düzenleyin</DialogDescription>
          </DialogHeader>
          {selectedReward ? (
            <RewardForm
              key={selectedReward.id}
              idPrefix="reward-edit"
              {...formProps}
              onSubmit={() => void submit('update')}
              submitLabel="Güncelle"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
