'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import { QueryState } from '@/components/states';
import { VersionConflictBanner } from '@/components/settings/version-conflict-banner';
import { fetchResourceJson, requireVersion, saveVersioned } from '@/lib/versioned-resource';
import { useVersionedDraft, useVersionedResource } from '@/hooks/use-versioned-resource';

type Role = 'dealer' | 'customer';
type RolePayload = { groupLabels?: Record<string, string>; itemGroups?: Record<string, string> };

const CATALOG: Record<Role, { items: NavItem[]; groups: NavGroup[] }> = {
  dealer: { items: dealerNavItems, groups: getNavGroups('dealer') },
  customer: { items: customerNavItems, groups: getNavGroups('customer') },
};

type RoleMaps = Record<Role, Record<string, string>>;
type GroupsDraft = { labels: RoleMaps; assign: RoleMaps };

async function loadGroups() {
  const body = await fetchResourceJson('/api/admin/settings/sidebar-groups', 'Menü grupları alınamadı');
  const p = (body.payload ?? {}) as Partial<Record<Role, RolePayload>>;
  return { data: toDraft(p), version: requireVersion(body) };
}

function toDraft(p: Partial<Record<Role, RolePayload>>): GroupsDraft {
  return {
    labels: { dealer: { ...(p.dealer?.groupLabels ?? {}) }, customer: { ...(p.customer?.groupLabels ?? {}) } },
    assign: { dealer: { ...(p.dealer?.itemGroups ?? {}) }, customer: { ...(p.customer?.itemGroups ?? {}) } },
  };
}

function PageIntro({ action }: { action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Menü Grupları</h1>
        <p className="text-sm text-muted-foreground">
          Sol menü gruplarının adını değiştirin ve hangi öğenin hangi gruba ait olduğunu düzenleyin.
        </p>
      </div>
      {action}
    </div>
  );
}

/**
 * P0-28: kayıtlı override'lar okunamazsa form AÇILMAZ (eskiden hata yutulup kod varsayılanları
 * kayıtlı ayar gibi gösteriliyor, Kaydet o rolün tüm override'larını siliyordu).
 */
export default function MenuGroupsPage() {
  const resource = useVersionedResource(loadGroups);

  if (resource.status === 'ready' && resource.data && resource.version) {
    return (
      <MenuGroupsForm
        key={resource.loadId}
        initial={resource.data}
        initialVersion={resource.version}
        onReload={resource.reload}
        onCommitted={resource.commit}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro />
      <QueryState
        query={resource.query}
        skeleton="form"
        isEmpty={() => false}
        loadingLabel="Menü grupları yükleniyor…"
        error={{
          title: 'Menü grupları yüklenemedi',
          description: 'Kayıtlı grup ayarları okunamadığı için düzenleme kilitlendi. Mevcut menünüz değişmedi; tekrar deneyin.',
        }}
      >
        {null}
      </QueryState>
    </div>
  );
}

function MenuGroupsForm({
  initial,
  initialVersion,
  onReload,
  onCommitted,
}: {
  initial: GroupsDraft;
  initialVersion: string;
  onReload: () => unknown;
  onCommitted: (draft: GroupsDraft, version: string) => void;
}) {
  const t = useAppT();
  const [role, setRole] = useState<Role>('customer');

  const request = useCallback(
    (draft: GroupsDraft, baseVersion: string) => {
      // Her iki rol de gönderilir: taslak sunucu yükünün birebir aynasıdır, sekme değiştirince
      // yapılan düzenlemeler kaybolmaz. i18n varsayılanıyla aynı ya da boş başlık override
      // olarak saklanmaz (çeviri güncellemeleri o gruba da ulaşsın).
      const payloadFor = (r: Role): RolePayload => ({
        groupLabels: Object.fromEntries(
          Object.entries(draft.labels[r]).filter(([key, v]) => {
            const g = CATALOG[r].groups.find((x) => x.key === key);
            const fallback = g ? t(`sidebarNavGroups.${r}.${g.labelKey}`) : '';
            return typeof v === 'string' && v.trim() !== '' && v.trim() !== fallback;
          })
        ),
        itemGroups: draft.assign[r],
      });
      return saveVersioned(
        '/api/admin/settings/sidebar-groups',
        'PUT',
        { dealer: payloadFor('dealer'), customer: payloadFor('customer'), baseVersion },
        'Kaydedilemedi'
      );
    },
    [t]
  );
  const parse = useCallback(
    (body: Record<string, unknown>) => ({
      data: toDraft((body.payload ?? {}) as Partial<Record<Role, RolePayload>>),
      version: requireVersion(body),
    }),
    []
  );
  const onSaved = useCallback(
    (draft: GroupsDraft, version: string) => {
      onCommitted(draft, version);
      toast.success('Menü grupları kaydedildi.');
    },
    [onCommitted]
  );
  const onError = useCallback((e: unknown) => {
    toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
  }, []);

  const form = useVersionedDraft<GroupsDraft>({ initial, initialVersion, request, parse, onSaved, onError });
  const labels = form.draft.labels;
  const assign = form.draft.assign;
  const saving = form.saving;

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
    form.setDraft((prev) => ({ ...prev, labels: { ...prev.labels, [role]: { ...prev.labels[role], [key]: value } } }));

  const setItemGroup = (item: NavItem, groupKey: string) => {
    const id = getNavOrderId(item);
    form.setDraft((prev) => ({ ...prev, assign: { ...prev.assign, [role]: { ...prev.assign[role], [id]: groupKey } } }));
  };

  const itemLabel = (it: NavItem) => t(`sidebarNav.${role}.${it.labelKey}`);

  return (
    <div className="space-y-6">
      <PageIntro
        action={
          <Button onClick={() => void form.save()} disabled={saving || !form.dirty}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        }
      />

      {form.conflict && (
        <VersionConflictBanner
          message={form.conflict.message}
          onReload={onReload}
          onOverwrite={form.conflict.currentVersion ? () => form.save({ overwrite: true }) : undefined}
        />
      )}

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
