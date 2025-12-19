'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Plus,
  Search,
  Edit,
  Trash2,
  Check,
  Star,
  Zap,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'MONTHLY' | 'YEARLY';
  features: string[];
  isPopular: boolean;
  isActive: boolean;
}

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    currency: 'TRY',
    interval: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    features: '',
    isPopular: false,
    isActive: true,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    // Simulated data - replace with API
    setTimeout(() => {
      setPlans([
        {
          id: '1',
          name: 'Ücretsiz',
          description: 'Küçük işletmeler için ideal başlangıç',
          price: 0,
          currency: 'TRY',
          interval: 'MONTHLY',
          features: ['3 QR Kod', 'Aylık 100 Geri Bildirim', 'Temel Analitik', 'E-posta Desteği'],
          isPopular: false,
          isActive: true,
        },
        {
          id: '2',
          name: 'Başlangıç',
          description: 'Büyüyen işletmeler için',
          price: 299,
          currency: 'TRY',
          interval: 'MONTHLY',
          features: ['10 QR Kod', 'Aylık 500 Geri Bildirim', 'Gelişmiş Analitik', 'AI Duygu Analizi', 'Öncelikli Destek'],
          isPopular: true,
          isActive: true,
        },
        {
          id: '3',
          name: 'Profesyonel',
          description: 'Orta ölçekli işletmeler için',
          price: 699,
          currency: 'TRY',
          interval: 'MONTHLY',
          features: ['Sınırsız QR Kod', 'Sınırsız Geri Bildirim', 'Tam Analitik Paketi', 'AI Asistan', 'API Erişimi', '7/24 Destek'],
          isPopular: false,
          isActive: true,
        },
      ]);
      setLoading(false);
    }, 500);
  };

  const handleCreate = async () => {
    const newPlan: PricingPlan = {
      id: Date.now().toString(),
      ...formData,
      features: formData.features.split('\n').filter(f => f.trim()),
    };
    setPlans([...plans, newPlan]);
    toast.success('Plan oluşturuldu');
    setCreateDialogOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!selectedPlan) return;
    
    setPlans(plans.map(p => 
      p.id === selectedPlan.id 
        ? { ...p, ...formData, features: formData.features.split('\n').filter(f => f.trim()) }
        : p
    ));
    toast.success('Plan güncellendi');
    setEditDialogOpen(false);
    setSelectedPlan(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    setPlans(plans.filter(p => p.id !== id));
    toast.success('Plan silindi');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: 0,
      currency: 'TRY',
      interval: 'MONTHLY',
      features: '',
      isPopular: false,
      isActive: true,
    });
  };

  const openEditDialog = (plan: PricingPlan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      features: plan.features.join('\n'),
      isPopular: plan.isPopular,
      isActive: plan.isActive,
    });
    setEditDialogOpen(true);
  };

  const PlanForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Plan Adı</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Örn: Profesyonel"
          />
        </div>
        <div className="space-y-2">
          <Label>Fiyat (₺)</Label>
          <Input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Plan açıklaması..."
        />
      </div>
      <div className="space-y-2">
        <Label>Özellikler (Her satıra bir özellik)</Label>
        <Textarea
          value={formData.features}
          onChange={(e) => setFormData({ ...formData, features: e.target.value })}
          placeholder="Sınırsız QR Kod&#10;AI Analiz&#10;7/24 Destek"
          rows={5}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.isPopular}
            onCheckedChange={(checked) => setFormData({ ...formData, isPopular: checked })}
          />
          <Label>Popüler Plan</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          />
          <Label>Aktif</Label>
        </div>
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
        title="Fiyatlandırma"
        description="Abonelik planlarını yönetin"
      />

      {/* Actions */}
      <div className="flex justify-end">
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Plan Oluştur</DialogTitle>
              <DialogDescription>
                Yeni bir fiyatlandırma planı ekleyin
              </DialogDescription>
            </DialogHeader>
            <PlanForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-muted rounded w-1/2" />
                  <div className="h-10 bg-muted rounded w-3/4" />
                  <div className="space-y-2">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="h-4 bg-muted rounded" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card 
                glass 
                className={`relative overflow-hidden ${plan.isPopular ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.isPopular && (
                  <div className="absolute top-0 right-0">
                    <Badge className="rounded-none rounded-bl-lg bg-primary">
                      <Star className="h-3 w-3 mr-1 fill-white" />
                      Popüler
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 space-y-6">
                  {/* Header */}
                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">₺{plan.price}</span>
                    <span className="text-muted-foreground">/ay</span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                      {plan.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEditDialog(plan)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Düzenle
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(plan.id)}
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
            <DialogTitle>Plan Düzenle</DialogTitle>
            <DialogDescription>
              {selectedPlan?.name} planını düzenleyin
            </DialogDescription>
          </DialogHeader>
          <PlanForm onSubmit={handleUpdate} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}



