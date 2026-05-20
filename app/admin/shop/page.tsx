'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { UserAvatarFrame, DiamondBadge, RubyBadge } from '@/components/ui/avatar-frame';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Pencil, Plus, RefreshCw, ShoppingBag, Sparkles } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { toast } from '@/lib/admin-toast';
import { cn } from '@/lib/utils';
import { PREMIUM_PANEL_CARD_BASE, premiumPanelCardAccentClass } from '@/lib/panel-surface';

type CosmeticRow = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  type: string;
  price: number;
  imageUrl: string | null;
  rarity: string;
  isActive: boolean;
  createdAt: string;
};

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  type: 'avatar_frame' as const,
  price: 100,
  imageUrl: '',
  rarity: 'common',
  isActive: true,
};

export default function AdminShopPage() {
  const t = useAppT();
  const [items, setItems] = useState<CosmeticRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CosmeticRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/cosmetics', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'load');
      setItems(data.items as CosmeticRow[]);
    } catch {
      toast.error(t('adminShop.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const seedDemos = async () => {
    try {
      setSeeding(true);
      const res = await fetch('/api/admin/cosmetics/seed-demos', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'seed');
      toast.success(t('adminShop.seedOk'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('adminShop.seedError'));
    } finally {
      setSeeding(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (row: CosmeticRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      slug: row.slug ?? '',
      description: row.description ?? '',
      type: row.type as typeof emptyForm.type,
      price: row.price,
      imageUrl: row.imageUrl ?? '',
      rarity: row.rarity,
      isActive: row.isActive,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    try {
      setSaving(true);
      if (editing) {
        const res = await fetch(`/api/admin/cosmetics/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim() || null,
            description: form.description.trim() || null,
            type: form.type,
            price: form.price,
            imageUrl: form.imageUrl.trim() || null,
            rarity: form.rarity,
            isActive: form.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || 'save');
        toast.success(t('adminShop.saveSuccess'));
      } else {
        const res = await fetch('/api/admin/cosmetics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim() || null,
            description: form.description.trim() || null,
            type: form.type,
            price: form.price,
            imageUrl: form.imageUrl.trim() || null,
            rarity: form.rarity,
            isActive: form.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || 'save');
        toast.success(t('adminShop.createSuccess'));
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('adminShop.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 pb-16">
      <AdminPremiumHero
        eyebrow={t('adminShop.eyebrow')}
        title={t('adminShop.title')}
        description={t('adminShop.description')}
        icon={<ShoppingBag className="size-7" aria-hidden />}
        tone="auto"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('mr-1.5 size-4', loading && 'animate-spin')} aria-hidden />
              {t('adminShop.reload')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void seedDemos()}
              disabled={seeding || loading}
            >
              <Sparkles className={cn('mr-1.5 size-4', seeding && 'animate-pulse')} aria-hidden />
              {t('adminShop.seedDemos')}
            </Button>
            <Button type="button" size="sm" onClick={openNew}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              {t('adminShop.newItem')}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t('adminShop.loading')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, i) => (
            <Card key={item.id} className={cn(PREMIUM_PANEL_CARD_BASE, 'overflow-hidden border-border/80')}>
              <div className={premiumPanelCardAccentClass(i % 3 === 0 ? 'cyan' : i % 3 === 1 ? 'violet' : 'emerald')} aria-hidden />
              <CardHeader className="pb-2 pl-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge variant={item.isActive ? 'default' : 'secondary'} className="mb-2">
                      {item.isActive ? t('adminShop.active') : t('adminShop.inactive')}
                    </Badge>
                    <CardTitle className="text-base leading-snug">{item.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {item.slug ?? item.id.slice(0, 8)}
                    </CardDescription>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => openEdit(item)}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pl-6">
                <div className="relative mx-auto aspect-square max-h-40 w-full max-w-[200px] overflow-hidden rounded-2xl border border-border/50 bg-muted/30 p-2 flex items-center justify-center">
                  {item.imageUrl === 'diamond_badge' ? (
                    <DiamondBadge className="w-20 h-20" />
                  ) : item.imageUrl === 'ruby_badge' ? (
                    <RubyBadge className="w-20 h-20" />
                  ) : item.imageUrl?.endsWith('_effect') ? (
                    <UserAvatarFrame frameId={item.imageUrl} className="w-24 h-24">
                       <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Sparkles className="text-muted-foreground/30 size-8" />
                       </div>
                    </UserAvatarFrame>
                  ) : item.imageUrl && (item.imageUrl.startsWith('/') || item.imageUrl.startsWith('http')) ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="200px"
                      unoptimized={item.imageUrl.endsWith('.svg')}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center p-4">
                      <div className="text-[10px] font-mono text-muted-foreground break-all mb-1 opacity-50">{item.imageUrl || 'No Image'}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('adminShop.noImage')}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{item.type}</Badge>
                  <Badge variant="outline">{item.rarity}</Badge>
                  <span className="font-semibold text-foreground">{item.price} XP</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('adminShop.editTitle') : t('adminShop.newTitle')}</DialogTitle>
            <DialogDescription>{t('adminShop.dialogHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="cs-name">{t('adminShop.fieldName')}</Label>
              <Input id="cs-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-slug">{t('adminShop.fieldSlug')}</Label>
              <Input
                id="cs-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="demo-aurora-frame"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-desc">{t('adminShop.fieldDesc')}</Label>
              <Input
                id="cs-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{t('adminShop.fieldType')}</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as typeof form.type }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avatar_frame">avatar_frame</SelectItem>
                    <SelectItem value="profile_badge">profile_badge</SelectItem>
                    <SelectItem value="profile_background">profile_background</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-price">{t('adminShop.fieldPrice')}</Label>
                <Input
                  id="cs-price"
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-url">{t('adminShop.fieldImageUrl')}</Label>
              <Input
                id="cs-url"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://api.dicebear.com/..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-rarity">{t('adminShop.fieldRarity')}</Label>
              <Input
                id="cs-rarity"
                value={form.rarity}
                onChange={(e) => setForm((f) => ({ ...f, rarity: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="cs-active" checked={form.isActive} onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: c }))} />
              <Label htmlFor="cs-active">{t('adminShop.fieldActive')}</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('adminShop.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving || !form.name.trim()}>
              {saving ? t('adminShop.saving') : t('adminShop.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
