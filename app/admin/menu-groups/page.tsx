'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  customerNavItems,
  dealerNavItems,
  getNavOrderId,
  getNavGroups,
  type NavItem,
  type NavGroup,
} from '@/components/dashboard/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAppT } from '@/lib/app-locale';
import { toast } from '@/lib/admin-toast';

type Role = 'dealer' | 'customer';
type RolePayload = { groupLabels?: Record<string, string>; itemGroups?: Record<string, string> };

const CATALOG: Record<Role, { items: NavItem[]; groups: NavGroup[] }> = {
  dealer: { items: dealerNavItems, groups: getNavGroups('dealer') },
  customer: { items: customerNavItems, groups: getNavGroups('customer') },
};

export default function MenuGroupsPage() {
  const t = useAppT();
  const [role, setRole] = useState<Role>('customer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Rol bazında override state.
  const [labels, setLabels] = useState<Record<Role, Record<string, string>>>({ dealer: {}, customer: {} });
  const [assign, setAssign] = useState<Record<Role, Record<string, string>>>({ dealer: {}, customer: {} });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/settings/sidebar-groups', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { success?: boolean; payload?: Partial<Record<Role, RolePayload>> }) => {
        if (cancelled || !data?.success) return;
        const p = data.payload ?? {};
        setLabels({
          dealer: p.dealer?.groupLabels ?? {},
          customer: p.customer?.groupLabels ?? {},
        });
        setAssign({
          dealer: p.dealer?.itemGroups ?? {},
          customer: p.customer?.itemGroups ?? {},
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const { items, groups } = CATALOG[role];
  const groupLabel = (g: NavGroup) =>
    labels[role][g.key] ?? t(`sidebarNavGroups.${role}.${g.labelKey}`);

  // Efektif grup: override varsa o, yoksa kod-varsayılan.
  const effectiveGroup = (item: NavItem) => {
    const id = getNavOrderId(item);
    return assign[role][id] ?? item.groupKey ?? '';
  };

  const grouped = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    const topLevel: NavItem[] = [];
    for (const it of items) {
      const g = effectiveGroup(it);
      if (!g) topLevel.push(it);
      else {
        if (!map.has(g)) map.set(g, []);
        map.get(g)!.push(it);
      }
    }
    return { map, topLevel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, assign, role]);

  const setLabel = (key: string, value: string) =>
    setLabels((prev) => ({ ...prev, [role]: { ...prev[role], [key]: value } }));

  const setItemGroup = (item: NavItem, groupKey: string) => {
    const id = getNavOrderId(item);
    setAssign((prev) => ({ ...prev, [role]: { ...prev[role], [id]: groupKey } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Partial<Record<Role, RolePayload>> = {
        [role]: {
          groupLabels: Object.fromEntries(Object.entries(labels[role]).filter(([, v]) => v && v.trim())),
          itemGroups: assign[role],
        },
      };
      const res = await fetch('/api/admin/settings/sidebar-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Kaydedilemedi');
      toast.success('Menü grupları kaydedildi.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const itemLabel = (it: NavItem) => t(`sidebarNav.${role}.${it.labelKey}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Menü Grupları</h1>
          <p className="text-sm text-muted-foreground">
            Sol menü gruplarının adını değiştirin ve hangi öğenin hangi gruba ait olduğunu düzenleyin.
          </p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>

      <Tabs value={role} onValueChange={(v) => setRole(v as Role)}>
        <TabsList>
          <TabsTrigger value="customer">Müşteri</TabsTrigger>
          <TabsTrigger value="dealer">Bayi</TabsTrigger>
        </TabsList>

        {(['customer', 'dealer'] as Role[]).map((r) => (
          <TabsContent key={r} value={r} className="space-y-6">
            {/* Grup adları */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Grup Adları</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {groups.map((g) => (
                  <div key={g.key} className="flex items-center gap-2">
                    <g.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={groupLabel(g)}
                      onChange={(e) => setLabel(g.key, e.target.value)}
                      placeholder={t(`sidebarNavGroups.${role}.${g.labelKey}`)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Öğe → grup atama */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Öğelerin Grupları</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {items.map((it) => {
                    const id = getNavOrderId(it);
                    const current = effectiveGroup(it);
                    return (
                      <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm">
                          <it.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {itemLabel(it)}
                        </span>
                        <select
                          value={current}
                          onChange={(e) => setItemGroup(it, e.target.value)}
                          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">— Üst düzey (grupsuz) —</option>
                          {groups.map((g) => (
                            <option key={g.key} value={g.key}>
                              {groupLabel(g)}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
