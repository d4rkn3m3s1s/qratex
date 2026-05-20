'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GripVertical, Loader2, RefreshCw, Save } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { toast } from '@/lib/admin-toast';
import { cn } from '@/lib/utils';
import { PREMIUM_PANEL_CARD_BASE, premiumPanelCardAccentClass } from '@/lib/panel-surface';
import {
  adminNavItems,
  customerNavItems,
  dealerNavItems,
  getNavOrderId,
  type NavItem,
} from '@/components/dashboard/sidebar';
import { applySidebarOrder, type SidebarNavOrderPayload } from '@/lib/sidebar-order-settings';

type RoleTab = 'admin' | 'dealer' | 'customer';

function mergeSavedOrder(items: NavItem[], saved?: string[] | null): string[] {
  const base = items.map(getNavOrderId);
  if (!saved?.length) return base;
  return applySidebarOrder(items, saved).map(getNavOrderId);
}

function reorderIds(list: string[], from: number, to: number): string[] {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function AdminSidebarOrderPage() {
  const t = useAppT();
  const [tab, setTab] = useState<RoleTab>('admin');

  useEffect(() => {
    setDragIndex(null);
  }, [tab]);
  const [adminOrder, setAdminOrder] = useState<string[]>(() => adminNavItems.map(getNavOrderId));
  const [dealerOrder, setDealerOrder] = useState<string[]>(() => dealerNavItems.map(getNavOrderId));
  const [customerOrder, setCustomerOrder] = useState<string[]>(() => customerNavItems.map(getNavOrderId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings/sidebar-order', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'load');
      const p = data.payload as SidebarNavOrderPayload;
      setAdminOrder(mergeSavedOrder(adminNavItems, p.admin));
      setDealerOrder(mergeSavedOrder(dealerNavItems, p.dealer));
      setCustomerOrder(mergeSavedOrder(customerNavItems, p.customer));
    } catch {
      toast.error(t('adminSidebarOrder.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/admin/settings/sidebar-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: adminOrder,
          dealer: dealerOrder,
          customer: customerOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'save');
      toast.success(t('adminSidebarOrder.saveSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('adminSidebarOrder.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const labelForId = (role: RoleTab, id: string): string => {
    const items =
      role === 'admin' ? adminNavItems : role === 'dealer' ? dealerNavItems : customerNavItems;
    const item = items.find((i) => getNavOrderId(i) === id);
    if (!item) return id;
    return t(`sidebarNav.${role}.${item.labelKey}`);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-16">
      <AdminPremiumHero
        eyebrow={t('adminSidebarOrder.eyebrow')}
        title={t('adminSidebarOrder.title')}
        description={t('adminSidebarOrder.description')}
        icon={<GripVertical className="size-7" aria-hidden />}
        tone="auto"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('mr-1.5 size-4', loading && 'animate-spin')} aria-hidden />
              {t('adminSidebarOrder.reload')}
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || loading}>
              <Save className="mr-1.5 size-4" aria-hidden />
              {saving ? t('adminSidebarOrder.saving') : t('adminSidebarOrder.save')}
            </Button>
          </div>
        }
      />

      <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'border-border/80')}>
        <div className={premiumPanelCardAccentClass('violet')} aria-hidden />
        <CardHeader className="pl-6">
          <CardTitle className="text-base">{t('adminSidebarOrder.hintTitle')}</CardTitle>
          <CardDescription className="text-pretty">{t('adminSidebarOrder.hintBody')}</CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {t('adminSidebarOrder.loading')}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as RoleTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="admin">{t('adminSidebarOrder.tabAdmin')}</TabsTrigger>
            <TabsTrigger value="dealer">{t('adminSidebarOrder.tabDealer')}</TabsTrigger>
            <TabsTrigger value="customer">{t('adminSidebarOrder.tabCustomer')}</TabsTrigger>
          </TabsList>
          {(['admin', 'dealer', 'customer'] as const).map((r) => (
            <TabsContent key={r} value={r} className="mt-4 space-y-2">
              <ul className="space-y-1.5 rounded-2xl border border-border/60 bg-card/50 p-2">
                {(r === 'admin' ? adminOrder : r === 'dealer' ? dealerOrder : customerOrder).map((id, idx) => (
                  <li
                    key={`${r}-${id}`}
                    draggable
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex === null || dragIndex === idx) return;
                      const list = r === 'admin' ? adminOrder : r === 'dealer' ? dealerOrder : customerOrder;
                      const set = r === 'admin' ? setAdminOrder : r === 'dealer' ? setDealerOrder : setCustomerOrder;
                      set(reorderIds(list, dragIndex, idx));
                      setDragIndex(null);
                    }}
                    className={cn(
                      'flex cursor-grab items-center gap-3 rounded-xl border border-transparent bg-background/80 px-3 py-2.5 text-sm shadow-sm active:cursor-grabbing',
                      'hover:border-primary/25'
                    )}
                  >
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-8 font-mono text-xs text-muted-foreground">{idx + 1}</span>
                    <span className="flex-1 font-medium">{labelForId(r, id)}</span>
                    <code className="hidden max-w-[40%] truncate text-[10px] text-muted-foreground sm:block">
                      {id}
                    </code>
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
