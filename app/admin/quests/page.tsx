'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Plus,
  Search,
  Edit,
  Trash2,
  Clock,
  Star,
  CheckCircle,
  XCircle,
  Calendar,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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

interface Quest {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: string;
  requirement: { type?: string; count?: number } | null;
  reward: { points?: number; xp?: number } | null;
  isActive: boolean;
  expiresAt: string | null;
  _count?: {
    users: number;
  };
}

const typeLabels: Record<string, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  special: 'Özel',
};

const typeColors: Record<string, string> = {
  daily: 'bg-green-500/10 text-green-500 border-green-500/20',
  weekly: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  monthly: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  special: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export default function AdminQuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '🎯',
    type: 'daily',
    target: 1,
    reward: 50,
    isActive: true,
    expiresAt: '',
  });

  useEffect(() => {
    fetchQuests();
  }, []);

  const fetchQuests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/quests');
      const data = await res.json();
      
      if (data.success) {
        setQuests(data.data);
      }
    } catch (error) {
      toast.error('Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const questData = {
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        type: formData.type,
        requirement: { type: 'custom', count: formData.target },
        reward: { points: formData.reward, xp: Math.floor(formData.reward / 2) },
        expiresAt: formData.expiresAt || null,
      };
      
      const res = await fetch('/api/gamification/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questData),
      });
      
      if (res.ok) {
        toast.success('Görev oluşturuldu');
        setCreateDialogOpen(false);
        resetForm();
        fetchQuests();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Görev oluşturulamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleUpdate = async () => {
    if (!selectedQuest) return;
    
    try {
      const questData = {
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        type: formData.type,
        requirement: { type: 'custom', count: formData.target },
        reward: { points: formData.reward, xp: Math.floor(formData.reward / 2) },
        expiresAt: formData.expiresAt || null,
        isActive: formData.isActive,
      };
      
      const res = await fetch(`/api/gamification/quests/${selectedQuest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questData),
      });
      
      if (res.ok) {
        toast.success('Görev güncellendi');
        setEditDialogOpen(false);
        setSelectedQuest(null);
        resetForm();
        fetchQuests();
      } else {
        toast.error('Görev güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gamification/quests/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('Görev silindi');
        fetchQuests();
      } else {
        toast.error('Görev silinemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'daily',
      target: 1,
      reward: 50,
      isActive: true,
      expiresAt: '',
    });
  };

  const openEditDialog = (quest: Quest) => {
    setSelectedQuest(quest);
    setFormData({
      name: quest.name,
      description: quest.description,
      icon: quest.icon || '🎯',
      type: quest.type || 'daily',
      target: quest.requirement?.count || 1,
      reward: quest.reward?.points || 50,
      isActive: quest.isActive,
      expiresAt: quest.expiresAt ? new Date(quest.expiresAt).toISOString().split('T')[0] : '',
    });
    setEditDialogOpen(true);
  };

  const filteredQuests = quests.filter((quest) =>
    quest.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const QuestForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Görev Adı</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Örn: Günlük Geri Bildirim"
        />
      </div>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Görev açıklaması..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tür</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => setFormData({ ...formData, type: value as Quest['type'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY">Günlük</SelectItem>
              <SelectItem value="WEEKLY">Haftalık</SelectItem>
              <SelectItem value="MONTHLY">Aylık</SelectItem>
              <SelectItem value="SPECIAL">Özel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Hedef</Label>
          <Input
            type="number"
            value={formData.target}
            onChange={(e) => setFormData({ ...formData, target: parseInt(e.target.value) || 1 })}
            min={1}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Ödül (Puan)</Label>
          <Input
            type="number"
            value={formData.reward}
            onChange={(e) => setFormData({ ...formData, reward: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Bitiş Tarihi (Opsiyonel)</Label>
          <Input
            type="date"
            value={formData.expiresAt}
            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
          />
        </div>
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
        title="Görev Yönetimi"
        description="Gamification görevlerini oluşturun ve yönetin"
      />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Görev ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Görev
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Görev Oluştur</DialogTitle>
              <DialogDescription>
                Kullanıcıların tamamlayabileceği yeni bir görev oluşturun
              </DialogDescription>
            </DialogHeader>
            <QuestForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Quests Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-2 bg-muted rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredQuests.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Görev bulunamadı</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuests.map((quest, index) => (
            <motion.div
              key={quest.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card glass hover className="group">
                <CardContent className="p-6 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{quest.name}</h3>
                        <Badge className={typeColors[quest.type]}>
                          {typeLabels[quest.type]}
                        </Badge>
                      </div>
                    </div>
                    {quest.isActive ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {quest.description}
                  </p>

                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Hedef</span>
                      <span className="font-medium">{quest.requirement?.count || 1}</span>
                    </div>
                    <Progress value={0} className="h-2" />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star className="h-4 w-4" />
                      <span>{quest.reward?.points || 0} puan</span>
                    </div>
                    <span className="text-muted-foreground">
                      {quest._count?.users || 0} katılımcı
                    </span>
                  </div>

                  {/* Expiry */}
                  {quest.expiresAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Bitiş: {new Date(quest.expiresAt).toLocaleDateString('tr-TR')}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(quest)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Düzenle
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(quest.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
            <DialogTitle>Görev Düzenle</DialogTitle>
            <DialogDescription>
              {selectedQuest?.name} görevini düzenleyin
            </DialogDescription>
          </DialogHeader>
          <QuestForm onSubmit={handleUpdate} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}



