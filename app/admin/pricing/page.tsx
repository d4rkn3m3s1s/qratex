'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { m as Motion } from 'framer-motion';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { useAppT } from '@/lib/app-locale';
import { ConfirmAction, QueryState } from '@/components/states';

type Interval = 'monthly' | 'yearly' | 'lifetime';

type PricingPlan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: Interval;
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  pricePerBranch: number | null;
  isPopular: boolean;
  isActive: boolean;
  order: number;
};

/**
 * Form durumu: sayısal alanlar METİN olarak tutulur (ör. "299." ara değeri ya da
 * boş alan yazarken kaybolmasın); sayıya çevirme yalnız kayıtta yapılır.
 */
type PlanFormValues = {
  name: string;
  description: string;
  price: string;
  currency: string;
  interval: Interval;
  features: string;
  maxQRCodes: string;
  maxBranches: string;
  pricePerBranch: string;
  isPopular: boolean;
  isActive: boolean;
};

const initialForm: PlanFormValues = {
  name: '',
  description: '',
  price: '0',
  currency: 'TRY',
  interval: 'monthly',
  features: '',
  maxQRCodes: '',
  maxBranches: '',
  pricePerBranch: '',
  isPopular: false,
  isActive: true,
};

const INTERVAL_LABELS: Record<Interval, string> = {
  monthly: 'Aylık',
  yearly: 'Yıllık',
  lifetime: 'Ömür boyu',
};

function isInterval(v: unknown): v is Interval {
  return v === 'monthly' || v === 'yearly' || v === 'lifetime';
}

function normalizeFeatures(lines: string): string[] {
  return lines
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** '' → null; geçersiz → NaN (doğrulamada yakalanır). */
function optionalNumber(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  return Number(s);
}

type PlanPayload = {
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: Interval;
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  pricePerBranch: number | null;
  isPopular: boolean;
  isActive: boolean;
};

function toPayload(f: PlanFormValues): PlanPayload {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    price: optionalNumber(f.price) ?? 0,
    currency: f.currency.trim().toUpperCase() || 'TRY',
    interval: f.interval,
    features: normalizeFeatures(f.features),
    maxQRCodes: optionalNumber(f.maxQRCodes),
    maxBranches: optionalNumber(f.maxBranches),
    pricePerBranch: optionalNumber(f.pricePerBranch),
    isPopular: f.isPopular,
    isActive: f.isActive,
  };
}

function validatePayload(p: PlanPayload): string | null {
  if (p.name.length < 2) return 'Plan adı en az 2 karakter olmalı';
  if (p.features.length === 0) return 'En az 1 özellik girin';
  if (p.features.some((f) => f.length > 200)) return 'Her özellik en fazla 200 karakter olabilir';
  if (!Number.isFinite(p.price) || p.price < 0) return 'Fiyat 0 veya daha büyük bir sayı olmalı';
  if (!/^[A-Z]{3}$/.test(p.currency)) return 'Para birimi 3 harfli ISO kodu olmalı (ör. TRY)';
  for (const [label, v] of [
    ['Maks QR', p.maxQRCodes],
    ['Maks şube', p.maxBranches],
  ] as const) {
    if (v !== null && (!Number.isInteger(v) || v < 0)) return `${label} boş ya da 0 veya daha büyük tam sayı olmalı`;
  }
  if (p.pricePerBranch !== null && (!Number.isFinite(p.pricePerBranch) || p.pricePerBranch < 0)) {
    return 'Şube başına fiyat boş ya da 0 veya daha büyük olmalı';
  }
  return null;
}

type PlanFormProps = {
  idPrefix: string;
  value: PlanFormValues;
  onChange: Dispatch<SetStateAction<PlanFormValues>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
};

/**
 * MODÜL SEVİYESİNDE tanımlı form (P0-39 / P0-22). Eskiden sayfa gövdesinde
 * `const Form = () => …` idi; her tuş vuruşunda input yeniden mount olup odak kayboluyordu.
 */
function PlanForm({ idPrefix, value, onChange, onSubmit, onCancel, submitLabel, saving }: PlanFormProps) {
  const set = <K extends keyof PlanFormValues>(key: K, v: PlanFormValues[K]) => onChange((s) => ({ ...s, [key]: v }));
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Plan adı</Label>
          <Input id={`${idPrefix}-name`} value={value.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-price`}>Fiyat</Label>
          <Input
            id={`${idPrefix}-price`}
            type="text"
            inputMode="decimal"
            value={value.price}
            onChange={(e) => set('price', e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Açıklama</Label>
        <Input
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={500}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-currency`}>Para birimi</Label>
          <Input
            id={`${idPrefix}-currency`}
            value={value.currency}
            maxLength={3}
            onChange={(e) => set('currency', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-interval`}>Döngü</Label>
          <Select value={value.interval} onValueChange={(v) => isInterval(v) && set('interval', v)}>
            <SelectTrigger id={`${idPrefix}-interval`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(INTERVAL_LABELS) as Interval[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {INTERVAL_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-maxqr`}>Maks QR (boş = sınırsız)</Label>
          <Input
            id={`${idPrefix}-maxqr`}
            inputMode="numeric"
            value={value.maxQRCodes}
            onChange={(e) => set('maxQRCodes', e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-maxbranch`}>Maks şube (boş = sınırsız)</Label>
          <Input
            id={`${idPrefix}-maxbranch`}
            inputMode="numeric"
            value={value.maxBranches}
            onChange={(e) => set('maxBranches', e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-perbranch`}>Şube başına fiyat</Label>
          <Input
            id={`${idPrefix}-perbranch`}
            inputMode="decimal"
            value={value.pricePerBranch}
            onChange={(e) => set('pricePerBranch', e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-features`}>Özellikler (her satıra bir özellik)</Label>
        <Textarea
          id={`${idPrefix}-features`}
          rows={5}
          value={value.features}
          onChange={(e) => set('features', e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch id={`${idPrefix}-popular`} checked={value.isPopular} onCheckedChange={(v) => set('isPopular', v)} />
          <Label htmlFor={`${idPrefix}-popular`}>Popüler</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`${idPrefix}-active`} checked={value.isActive} onCheckedChange={(v) => set('isActive', v)} />
          <Label htmlFor={`${idPrefix}-active`}>Aktif</Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          İptal
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function mapPlan(p: Record<string, unknown>): PricingPlan {
  const rawFeatures = p.features as unknown;
  const features = Array.isArray(rawFeatures)
    ? rawFeatures.map((f) => String(f))
    : Array.isArray((rawFeatures as { features?: unknown })?.features)
      ? (rawFeatures as { features: unknown[] }).features.map((f) => String(f))
      : [];
  return {
    id: String(p.id),
    name: String(p.name),
    description: p.description == null ? null : String(p.description),
    price: Number(p.price) || 0,
    currency: String(p.currency || 'TRY'),
    interval: isInterval(p.interval) ? p.interval : 'monthly',
    features,
    maxQRCodes: p.maxQRCodes == null ? null : Number(p.maxQRCodes),
    maxBranches: p.maxBranches == null ? null : Number(p.maxBranches),
    pricePerBranch: p.pricePerBranch == null ? null : Number(p.pricePerBranch),
    isPopular: Boolean(p.isPopular),
    isActive: Boolean(p.isActive),
    order: Number(p.order) || 0,
  };
}

export default function AdminPricingPage() {
  const t = useAppT();
  const [plans, setPlans] = useState<PricingPlan[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<PricingPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormValues>(initialForm);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch('/api/admin/pricing', { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || 'Fiyat planları yüklenemedi');
      const list = (j.plans ?? []) as Array<Record<string, unknown>>;
      setPlans(list.map(mapPlan));
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error('Yükleme hatası'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => setFormData(initialForm);

  const closeDialogs = () => {
    setCreateOpen(false);
    setEditOpen(false);
    setSelected(null);
    reset();
  };

  const openEdit = (plan: PricingPlan) => {
    setSelected(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      price: String(plan.price),
      currency: plan.currency,
      interval: plan.interval,
      features: plan.features.join('\n'),
      maxQRCodes: plan.maxQRCodes == null ? '' : String(plan.maxQRCodes),
      maxBranches: plan.maxBranches == null ? '' : String(plan.maxBranches),
      pricePerBranch: plan.pricePerBranch == null ? '' : String(plan.pricePerBranch),
      isPopular: plan.isPopular,
      isActive: plan.isActive,
    });
    setEditOpen(true);
  };

  const payload = useMemo(() => toPayload(formData), [formData]);

  const submit = async (method: 'POST' | 'PUT') => {
    const err = validatePayload(payload);
    if (err) {
      toast.error(err);
      return;
    }
    if (method === 'PUT' && !selected) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/pricing', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'PUT' ? { id: selected!.id, ...payload } : payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        throw new Error(j?.error || (method === 'POST' ? 'Plan oluşturulamadı' : 'Plan güncellenemedi'));
      }
      toast.success(method === 'POST' ? 'Plan oluşturuldu' : 'Plan güncellendi');
      closeDialogs();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  /** ConfirmAction içinden: hata fırlatırsa diyalog açık kalır. */
  const deletePlan = async (id: string) => {
    const r = await fetch(`/api/admin/pricing?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) throw new Error(j?.error || 'Plan silinemedi');
    toast.success('Plan silindi');
    await load();
  };

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        eyebrow="Gelir"
        title="Fiyatlandırma"
        description="Abonelik planları gerçek veritabanından yönetilir."
        icon={<CreditCard className="text-white" />}
        actions={
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              if (open) reset();
              setCreateOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2 bg-white text-emerald-900 shadow-md hover:bg-white/90">
                <Plus className="h-4 w-4" aria-hidden /> Yeni plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Yeni plan</DialogTitle>
                <DialogDescription>Plan bilgilerini doldurun</DialogDescription>
              </DialogHeader>
              <PlanForm
                idPrefix="plan-create"
                value={formData}
                onChange={setFormData}
                onSubmit={() => void submit('POST')}
                onCancel={closeDialogs}
                submitLabel="Oluştur"
                saving={saving}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <QueryState
        query={{ data: plans, error: loadError, isLoading: loading && !plans, refetch: load }}
        skeleton="cards"
        loadingLabel={t('adminInlineLoading.pricingPlans')}
        empty={{ variant: 'first-use', title: 'Henüz fiyat planı yok', description: '“Yeni plan” ile ilk abonelik planınızı oluşturun.' }}
      >
        {(list) => (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {list.map((plan, index) => (
              <Motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 10) * 0.04 }}
              >
                <Card className={plan.isPopular ? 'ring-2 ring-primary/60' : ''}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold leading-tight">{plan.name}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{plan.description || 'Açıklama yok'}</p>
                      </div>
                      {plan.isPopular ? (
                        <Badge className="shrink-0">
                          <Star className="mr-1 h-3 w-3" aria-hidden /> Popüler
                        </Badge>
                      ) : null}
                    </div>

                    <div className="text-2xl font-bold tabular-nums">
                      {plan.currency} {plan.price.toLocaleString('tr-TR')}
                      <span className="text-sm font-normal text-muted-foreground"> / {INTERVAL_LABELS[plan.interval]}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline">{plan.maxQRCodes != null ? `${plan.maxQRCodes} QR` : 'QR sınırsız'}</Badge>
                      <Badge variant="outline">{plan.maxBranches != null ? `${plan.maxBranches} şube` : 'Şube sınırsız'}</Badge>
                      {!plan.isActive ? <Badge variant="secondary">Pasif</Badge> : <Badge>Aktif</Badge>}
                    </div>

                    <ul className="space-y-1.5 text-sm">
                      {plan.features.slice(0, 5).map((feature, i) => (
                        <li key={`${i}-${feature}`} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                          <span className="line-clamp-1">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                        <Edit className="mr-2 h-4 w-4" aria-hidden /> Düzenle
                      </Button>
                      <ConfirmAction
                        trigger={
                          <Button variant="outline" size="icon" className="text-destructive" aria-label={`${plan.name} planını sil`}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        }
                        title="Plan silinsin mi?"
                        description={`“${plan.name}” planı kalıcı olarak silinecek. Mevcut aboneler varsa önce planı pasife almanız önerilir.`}
                        confirmPhrase={plan.name}
                        confirmLabel="Planı sil"
                        onConfirm={() => deletePlan(plan.id)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Motion.div>
            ))}
          </div>
        )}
      </QueryState>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) closeDialogs();
          else setEditOpen(true);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plan düzenle</DialogTitle>
            <DialogDescription>{selected?.name}</DialogDescription>
          </DialogHeader>
          {selected ? (
            <PlanForm
              key={selected.id}
              idPrefix="plan-edit"
              value={formData}
              onChange={setFormData}
              onSubmit={() => void submit('PUT')}
              onCancel={closeDialogs}
              submitLabel="Güncelle"
              saving={saving}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
