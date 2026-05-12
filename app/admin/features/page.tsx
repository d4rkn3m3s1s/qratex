'use client';

import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import {
  ToggleLeft,
  Plus,
  Search,
  Trash2,
  Check,
  X,
  Zap,
  Shield,
  Sparkles,
  Bell,
  MessageSquare,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import Link from 'next/link';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  createdAt: string;
}

const featureIcons: Record<string, ElementType> = {
  ai: Sparkles,
  notifications: Bell,
  gamification: Zap,
  security: Shield,
  feedback: MessageSquare,
  default: ToggleLeft,
};

export default function AdminFeaturesPage() {
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    description: '',
    isEnabled: true,
  });

  useEffect(() => {
    fetchFeatures();
  }, []);

  const fetchFeatures = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/features');
      const data = await res.json();
      if (res.ok) {
        setFeatures(Array.isArray(data.features) ? data.features : []);
      } else {
        toast.error(data.error ?? 'Özellik bayrakları alınamadı');
        setFeatures([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Özellik bayrakları yüklenemedi');
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFeature = async (id: string, currentState: boolean) => {
    try {
      const res = await fetch('/api/admin/features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isEnabled: !currentState }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Güncellenemedi');
      }
      setFeatures(features.map(f => 
        f.id === id ? { ...f, isEnabled: !currentState } : f
      ));
      toast.success(`Özellik ${!currentState ? 'aktif' : 'pasif'} edildi`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Özellik güncellenemedi');
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/admin/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Oluşturulamadı');
      }
      toast.success('Özellik oluşturuldu');
      setCreateDialogOpen(false);
      resetForm();
      fetchFeatures();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Özellik oluşturulamadı');
    }
  };

  const handleDelete = async (feature: FeatureFlag) => {
    try {
      const res = await fetch(`/api/admin/features?key=${encodeURIComponent(feature.key)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Silinemedi');
      }
      setFeatures(features.filter((f) => f.id !== feature.id));
      toast.success('Özellik silindi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Özellik silinemedi');
    }
  };

  const resetForm = () => {
    setFormData({
      key: '',
      name: '',
      description: '',
      isEnabled: true,
    });
  };

  const getIcon = (key: string) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('ai') || lowerKey.includes('sentiment')) return featureIcons.ai;
    if (lowerKey.includes('notification') || lowerKey.includes('push')) return featureIcons.notifications;
    if (lowerKey.includes('gamification') || lowerKey.includes('badge') || lowerKey.includes('point')) return featureIcons.gamification;
    if (lowerKey.includes('security') || lowerKey.includes('auth')) return featureIcons.security;
    if (lowerKey.includes('feedback') || lowerKey.includes('message')) return featureIcons.feedback;
    return featureIcons.default;
  };

  const filteredFeatures = features.filter((feature) =>
    feature.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    feature.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: features.length,
    enabled: features.filter(f => f.isEnabled).length,
    disabled: features.filter(f => !f.isEnabled).length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Özellik Yönetimi"
        description="Platform özelliklerini açıp kapatın"
      />

      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Özellik mantığı</p>
            <p className="text-xs text-muted-foreground">
              Buradaki her kayıt bir feature flag&apos;dir. Yeni özellik ekleyip aç/kapat yaparak modülleri canlıda kontrollü yayınlayabilirsiniz.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tech/add">Teknoloji Ekle ekranını aç</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ToggleLeft className="h-5 w-5 text-primary" />
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
              <div className="p-2 rounded-lg bg-green-500/10">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.enabled}</p>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.disabled}</p>
                <p className="text-xs text-muted-foreground">Pasif</p>
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
            placeholder="Özellik ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Özellik
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Özellik Ekle</DialogTitle>
              <DialogDescription>
                Platform için yeni bir özellik bayrağı oluşturun
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Anahtar (Key)</Label>
                <Input
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                  placeholder="feature_key"
                />
              </div>
              <div className="space-y-2">
                <Label>Özellik Adı</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Örn: AI Analiz"
                />
              </div>
              <div className="space-y-2">
                <Label>Açıklama</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Özellik açıklaması..."
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Varsayılan Durum</Label>
                <Switch
                  checked={formData.isEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setCreateDialogOpen(false);
                  resetForm();
                }}>
                  İptal
                </Button>
                <Button onClick={handleCreate}>Oluştur</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Features Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-10 w-10 bg-muted rounded-lg" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredFeatures.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center">
            <ToggleLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Özellik bulunamadı</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFeatures.map((feature, index) => {
            const Icon = getIcon(feature.key);
            return (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card glass hover className="group">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${feature.isEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Icon className={`h-6 w-6 ${feature.isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-semibold">{feature.name}</h3>
                          <p className="text-sm text-muted-foreground">{feature.description}</p>
                          <Badge variant="outline" className="text-xs">
                            {feature.key}
                          </Badge>
                        </div>
                      </div>
                      <Switch
                        checked={feature.isEnabled}
                        onCheckedChange={() => toggleFeature(feature.id, feature.isEnabled)}
                      />
                    </div>
                    
                    {/* Delete button on hover */}
                    <div className="mt-4 pt-4 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => handleDelete(feature)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Sil
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}




