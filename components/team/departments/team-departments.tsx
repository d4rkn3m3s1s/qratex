'use client';

import { Suspense, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Crown, Plus, Users2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelPage, PageHeader, SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { EmptyState, InlineError, QueryState, SkeletonCards } from '@/components/states';
import { cn } from '@/lib/utils';
import { DEPARTMENT_COLORS } from '@/lib/team/constants';
import { errorMessage, teamFetch } from '../lib/api';
import { API, teamKeys, useTeamMeta } from '../lib/queries';
import type { ClientViewer, TeamMeta } from '../lib/types';
import { DepartmentCard } from './department-card';
import { MembersPanel } from './members-panel';
import { AuditPanel } from './audit-panel';
import { useTeamCopy } from '../copy';

/**
 * Departmanlar ve üyeler (yönetici) / Ekip rehberi (üye). Yetki sunucudan gelir; üye salt
 * okunur rehber görür (denetim Bulgu 4/9/#28/#38: üye tüm yazma kontrollerini görüp 403
 * alıyordu). Her mutasyon sunucu yanıtıyla doğrulanır; tam sayfa spinner yerine arka planda
 * yenilenir (denetim Bulgu 8).
 */
export function TeamDepartments(props: { basePath: '/admin/ekip' | '/customer/ekip'; viewer: ClientViewer; initialMeta: TeamMeta | undefined }) {
  return (
    <Suspense fallback={<SkeletonCards />}>
      <Inner {...props} />
    </Suspense>
  );
}

function Inner({ basePath, viewer, initialMeta }: { basePath: string; viewer: ClientViewer; initialMeta: TeamMeta | undefined }) {
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const meta = useTeamMeta(initialMeta);
  const qc = useQueryClient();
  const manage = viewer.isManager;
  const [tab, setTab] = useState('departments');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEPARTMENT_COLORS[0]);
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const departments = useMemo(() => meta.data?.departments ?? [], [meta.data]);
  const members = useMemo(() => (meta.data?.members ?? []).filter((m) => m.inTeam), [meta.data]);
  const managers = members.filter((m) => m.teamRole === 'yonetici');
  const noDept = members.filter((m) => m.departmentSlugs.length === 0);
  const active = departments.filter((d) => d.isActive);
  const withoutManager = active.filter((d) => !members.some((m) => m.teamRole === 'yonetici' && m.departmentSlugs.includes(d.slug)));

  const refresh = () => qc.invalidateQueries({ queryKey: teamKeys.meta });

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await teamFetch(`${API}/departments`, { method: 'POST', json: { name: name.trim(), color, description: desc.trim() || null } });
      toast.success(tu.departmanOlusturuldu, { description: name.trim() });
      setName('');
      setDesc('');
      void refresh();
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const seed = async () => {
    try {
      const r = await teamFetch<{ seeded: number }>(`${API}/departments?seed=1`, { method: 'POST' });
      toast.success(r.seeded ? `${r.seeded} departman eklendi` : tu.varsayilanDepartmanlarZatenVar);
      void refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={
        <PageHeader
          title={manage ? tu.departmanlarVeUyeler : 'Ekip rehberi'}
          description={manage ? tu.ekibinYapisiRollerVe : tu.kimHangiDepartmandaKime}
          icon={<Building2 />}
          back={{ href: basePath, label: tu.ekip }}
        />
      }
    >
      <QueryState query={meta} skeleton="cards">
        {() => (
          <div className="space-y-4">
            <MetricGrid cols={4}>
              <MetricTile label={tu.ekipUyesi} metric={{ value: members.length }} icon={<Users2 />} size="compact" />
              <MetricTile label={tu.yonetici} metric={{ value: managers.length }} icon={<Crown />} size="compact" hint={tu.platformYoneticileriHerZaman} />
              <button
                type="button"
                className="rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setDeptFilter('none');
                  setTab('members');
                }}
              >
                <MetricTile label={tu.departmansiz} metric={{ value: noDept.length }} icon={<UserX />} tone={noDept.length ? 'warning' : 'neutral'} size="compact" hint={tu.listeyiAc} />
              </button>
              <MetricTile
                label={tu.aktifDepartman}
                metric={{ value: active.length }}
                icon={<Building2 />}
                size="compact"
                hint={withoutManager.length ? `${withoutManager.length} departmanın yöneticisi yok` : undefined}
              />
            </MetricGrid>
            {meta.data?.membersTruncated && <InlineError variant="banner" tone="warning">{tx.first500Members}</InlineError>}

            <SectionTabs
              value={tab}
              onValueChange={setTab}
              ariaLabel={tu.ekipYapisiBolumleri}
              touchTarget
              tabs={[
                { value: 'departments', label: tu.departmanlar, count: departments.length },
                { value: 'members', label: tu.uyeler, count: members.length },
                ...(manage ? [{ value: 'audit', label: tu.degisiklikGecmisi }] : []),
              ]}
            >
              {(t) =>
                t === 'departments' ? (
                  <div className="space-y-4">
                    {manage && (
                      <form
                        className="space-y-2 rounded-card border border-subtle bg-surface-1 p-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void create();
                        }}
                      >
                        <p className="qx-small font-semibold text-fg">{tx.createDept}</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <div className="flex-1 space-y-1">
                            <label htmlFor="dept-name" className="sr-only">
                              {tu.departmanAdi}
                            </label>
                            <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tu.adOrInsanKaynaklari} maxLength={60} />
                          </div>
                          <div className="flex-1">
                            <label htmlFor="dept-desc" className="sr-only">
                              {tu.aciklama}
                            </label>
                            <Input id="dept-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={tu.kisaAciklamaIstegeBagli} maxLength={300} />
                          </div>
                          <Button type="submit" className="gap-1.5" disabled={creating || name.trim().length < 2}>
                            <Plus className="h-4 w-4" aria-hidden /> {tu.olustur}
                          </Button>
                        </div>
                        <div role="group" aria-label={tu.departmanRengi} className="flex flex-wrap gap-1.5">
                          {DEPARTMENT_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-pressed={color === c}
                              aria-label={`Renk ${c}`}
                              onClick={() => setColor(c)}
                              className={cn('h-9 w-9 rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', color === c ? 'border-fg' : 'border-transparent')}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        {createError && <InlineError variant="banner">{createError}</InlineError>}
                      </form>
                    )}
                    {departments.length === 0 ? (
                      <EmptyState
                        variant="first-use"
                        title={tu.henuzDepartmanYok}
                        description={manage ? tu.kendiDepartmaniniOlusturYa : tu.yoneticilerDepartmanOlusturdugundaBurada}
                        action={manage ? <Button onClick={seed}>{tx.seedDepts}</Button> : undefined}
                      />
                    ) : (
                      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {departments.map((d, i) => (
                          <DepartmentCard
                            key={d.slug}
                            dept={d}
                            index={i}
                            total={departments.length}
                            departments={departments}
                            members={members}
                            manage={manage}
                            onShowMembers={() => {
                              setDeptFilter(d.slug);
                              setTab('members');
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ) : t === 'members' ? (
                  <MembersPanel viewer={viewer} meta={meta.data!} deptFilter={deptFilter} onDeptFilter={setDeptFilter} />
                ) : (
                  <AuditPanel />
                )
              }
            </SectionTabs>
          </div>
        )}
      </QueryState>
    </PanelPage>
  );
}
