'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, Check, Star, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';

type PricingPlan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly' | 'lifetime';
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  pricePerBranch: number | null;
  isPopular: boolean;
  isActive: boolean;
  order: number;
};

type FormData = {
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly' | 'lifetime';
  features: string;
  maxQRCodes: number | null;
  maxBranches: number | null;
  pricePerBranch: number | null;
  isPopular: boolean;
  isActive: boolean;
};

const initialForm: FormData = {
  name: '',
  description: '',
  price: 0,
  currency: 'TRY',
  interval: 'monthly',
  features: '',
  maxQRCodes: null,
  maxBranches: null,
  pricePerBranch: null,
  isPopular: false,
  isActive: true,
};

function normalizeFeatures(lines: string): string[] {
  return lines
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function AdminPricingPage() {
  const t = useAppT();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<PricingPlan | null>(null);
  const [formData, setFormData] = useState<FormData>(initialForm);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/pricing', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Fiyat planları yüklenemedi');
      const list = (j.plans ?? []) as Array<Record<string, unknown>>;
      const mapped: PricingPlan[] = list.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        description: p.description == null ? null : String(p.description),
        price: Number(p.price) || 0,
        currency: String(p.currency || 'TRY'),
        interval: (String(p.interval || 'monthly') as PricingPlan['interval']),
        features: Array.isArray(p.features)
          ? p.features.map((f) => String(f))
          : Array.isArray((p.features as { features?: unknown })?.features)
            ? ((p.features as { features: unknown[] }).features.map((f) => String(f)))
            : [],
        maxQRCodes: p.maxQRCodes == null ? null : Number(p.maxQRCodes),
        maxBranches: p.maxBranches == null ? null : Number(p.maxBranches),
        pricePerBranch: p.pricePerBranch == null ? null : Number(p.pricePerBranch),
        isPopular: Boolean(p.isPopular),
        isActive: Boolean(p.isActive),
        order: Number(p.order) || 0,
      }));
      setPlans(mapped);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const reset = () => setFormData(initialForm);

  const openEdit = (plan: PricingPlan) => {
    setSelected(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      features: plan.features.join('\n'),
      maxQRCodes: plan.maxQRCodes,
      maxBranches: plan.maxBranches,
      pricePerBranch: plan.pricePerBranch,
      isPopular: plan.isPopular,
      isActive: plan.isActive,
    });
    setEditOpen(true);
  };

  const payload = useMemo(
    () => ({
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      price: formData.price,
      currency: formData.currency.trim() || 'TRY',
      interval: formData.interval,
      features: normalizeFeatures(formData.features),
      maxQRCodes: formData.maxQRCodes,
      maxBranches: formData.maxBranches,
      pricePerBranch: formData.pricePerBranch,
      isPopular: formData.isPopular,
      isActive: formData.isActive,
    }),
    [formData]
  );

  const createPlan = async () => {
    if (payload.name.length < 2 || payload.features.length === 0) {
      toast.error('Plan adı ve en az 1 özellik gerekli');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Plan oluşturulamadı');
      toast.success('Plan oluşturuldu');
      setCreateOpen(false);
      reset();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const updatePlan = async () => {
    if (!selected) return;
    if (payload.name.length < 2 || payload.features.length === 0) {
      toast.error('Plan adı ve en az 1 özellik gerekli');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...payload }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Plan güncellenemedi');
      toast.success('Plan güncellendi');
      setEditOpen(false);
      setSelected(null);
      reset();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id: string) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/pricing?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Plan silinemedi');
      toast.success('Plan silindi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const Form = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Plan adı</Label>
          <Input value={formData.name} onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Fiyat</Label>
          <Input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData((s) => ({ ...s, price: Number(e.target.value) || 0 }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData((s) => ({ ...s, description: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Para birimi</Label>
          <Input
            value={formData.currency}
            onChange={(e) => setFormData((s) => ({ ...s, currency: e.target.value.toUpperCase() }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Döngü (monthly/yearly/lifetime)</Label>
          <Input
            value={formData.interval}
            onChange={(e) => {
              const v = e.target.value as FormData['interval'];
              if (v === 'monthly' || v === 'yearly' || v === 'lifetime') {
                setFormData((s) => ({ ...s, interval: v }));
              }
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Maks QR (boş=sınırsız)</Label>
          <Input
            type="number"
            value={formData.maxQRCodes ?? ''}
            onChange={(e) =>
              setFormData((s) => ({
                ...s,
                maxQRCodes: e.target.value === '' ? null : Number(e.target.value) || null,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Maks şube (boş=sınırsız)</Label>
          <Input
            type="number"
            value={formData.maxBranches ?? ''}
            onChange={(e) =>
              setFormData((s) => ({
                ...s,
                maxBranches: e.target.value === '' ? null : Number(e.target.value) || null,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Şube başına fiyat</Label>
          <Input
            type="number"
            value={formData.pricePerBranch ?? ''}
            onChange={(e) =>
              setFormData((s) => ({
                ...s,
                pricePerBranch: e.target.value === '' ? null : Number(e.target.value) || null,
              }))
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Özellikler (satır satır)</Label>
        <Textarea
          rows={5}
          value={formData.features}
          onChange={(e) => setFormData((s) => ({ ...s, features: e.target.value }))}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch checked={formData.isPopular} onCheckedChange={(v) => setFormData((s) => ({ ...s, isPopular: v }))} />
          <Label>Popüler</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={formData.isActive} onCheckedChange={(v) => setFormData((s) => ({ ...s, isActive: v }))} />
          <Label>Aktif</Label>
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            setCreateOpen(false);
            setEditOpen(false);
            setSelected(null);
            reset();
          }}
        >
          İptal
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        eyebrow="Gelir"
        title="Fiyatlandırma"
        description="Abonelik planları gerçek veritabanından yönetilir."
        icon={<CreditCard className="text-white" />}
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-white text-emerald-900 hover:bg-white/90 shadow-md">
                <Plus className="h-4 w-4" /> Yeni plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni plan</DialogTitle>
                <DialogDescription>Plan bilgilerini doldurun</DialogDescription>
              </DialogHeader>
              <Form onSubmit={createPlan} submitLabel="Oluştur" />
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <InlineLoadingStatus className="py-16" label={t('adminInlineLoading.pricingPlans')} />
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Henüz fiyat planı yok.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((plan, index) => (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.04 }}>
              <Card className={plan.isPopular ? 'ring-2 ring-primary/60' : ''}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold leading-tight">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.description || 'Açıklama yok'}</p>
                    </div>
                    {plan.isPopular ? (
                      <Badge>
                        <Star className="h-3 w-3 mr-1" /> Popüler
                      </Badge>
                    ) : null}
                  </div>

                  <div className="text-2xl font-bold tabular-nums">
                    {plan.currency} {plan.price.toLocaleString('tr-TR')}
                    <span className="text-sm text-muted-foreground font-normal"> / {plan.interval}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {plan.maxQRCodes != null ? <Badge variant="outline">{plan.maxQRCodes} QR</Badge> : <Badge variant="outline">QR sınırsız</Badge>}
                    {plan.maxBranches != null ? <Badge variant="outline">{plan.maxBranches} şube</Badge> : <Badge variant="outline">Şube sınırsız</Badge>}
                    {!plan.isActive ? <Badge variant="secondary">Pasif</Badge> : <Badge>Aktif</Badge>}
                  </div>

                  <ul className="space-y-1.5 text-sm">
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span className="line-clamp-1">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                      <Edit className="h-4 w-4 mr-2" /> Düzenle
                    </Button>
                    <Button variant="outline" size="icon" className="text-destructive" onClick={() => void deletePlan(plan.id)} disabled={saving}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan düzenle</DialogTitle>
            <DialogDescription>{selected?.name}</DialogDescription>
          </DialogHeader>
          <Form onSubmit={updatePlan} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
