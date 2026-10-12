'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Star, UserMinus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, InlineError } from '@/components/states';
import { errorMessage, qs, teamFetch } from '../lib/api';
import { API, teamKeys } from '../lib/queries';
import { MemberAvatar, useDisplayName } from '../shared';
import type { ClientViewer, TeamMemberRow, TeamMeta } from '../lib/types';
import { useTeamCopy } from '../copy';

type Candidate = { id: string; name: string | null; email: string; image: string | null };

/**
 * Üyeler ve erişim. Kurallar sunucuda (denetim Bulgu 5/8): ekip rolünü yalnız platform
 * yöneticisi değiştirir; kimse kendi rolünü değiştiremez ya da kendini çıkaramaz; başka
 * yöneticiyi yalnız platform yöneticisi çıkarır. Departman değişikliği tekil ekle/çıkar
 * (yarışsız; Bulgu 12); birincil departman açıkça seçilir (Bulgu 31).
 */
export function MembersPanel({
  viewer,
  meta,
  deptFilter,
  onDeptFilter,
}: {
  viewer: ClientViewer;
  meta: TeamMeta;
  deptFilter: string;
  onDeptFilter: (v: string) => void;
}) {
  const dn = useDisplayName();
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const qc = useQueryClient();
  const manage = viewer.isManager;
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [removing, setRemoving] = useState<TeamMemberRow | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: teamKeys.meta });
  const departments = meta.departments;
  const deptName = (s: string) => departments.find((d) => d.slug === s)?.name ?? s;

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return meta.members
      .filter((m) => m.inTeam)
      .filter((m) => !needle || (m.name ?? '').toLocaleLowerCase('tr').includes(needle) || (m.email ?? '').toLowerCase().includes(needle))
      .filter((m) => role === 'all' || m.teamRole === role)
      .filter((m) => (deptFilter === 'all' ? true : deptFilter === 'none' ? m.departmentSlugs.length === 0 : m.departmentSlugs.includes(deptFilter)));
  }, [meta.members, q, role, deptFilter]);

  const put = async (body: Record<string, unknown>, msg: string) => {
    try {
      await teamFetch(`${API}/members`, { method: 'PUT', json: body });
      toast.success(msg);
      void refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tu.uyeAra} aria-label={tu.uyeAra} className="h-11 pl-9" />
        </div>
        <Select value={deptFilter} onValueChange={onDeptFilter}>
          <SelectTrigger className="h-11 lg:w-64" aria-label={tu.departmanFiltresi}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx.allDepartments}</SelectItem>
            <SelectItem value="none">{tx.noDepartment}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-11 lg:w-44" aria-label={tu.rolFiltresi}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx.allRoles}</SelectItem>
            <SelectItem value="yonetici">{tx.roleManager}</SelectItem>
            <SelectItem value="uye">{tx.roleMember}</SelectItem>
          </SelectContent>
        </Select>
        {manage && (
          <AddMember
            viewer={viewer}
            meta={meta}
            onAdded={() => {
              void refresh();
              void qc.invalidateQueries({ queryKey: INVITES_KEY });
            }}
          />
        )}
      </div>

      {manage && <PendingInvitations viewer={viewer} />}

      {rows.length === 0 ? (
        <EmptyState variant={q || role !== 'all' || deptFilter !== 'all' ? 'filtered' : 'default'} title={tu.uyeBulunamadi} compact />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border-subtle))] rounded-card border border-subtle bg-surface-1">
          {rows.map((m) => {
            const canRole = manage && viewer.isAdmin && !m.isSelf;
            const canRemove = manage && !m.isSelf && (viewer.isAdmin || m.teamRole !== 'yonetici');
            const canDept = manage;
            return (
              <li key={m.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <MemberAvatar user={m} size="md" />
                  <div className="min-w-0">
                    <p className="qx-small flex flex-wrap items-center gap-1.5 font-semibold text-fg">
                      {dn(m)}
                      {m.isSelf && <StatusBadge label={tu.sen} tone="brand" icon={null} size="sm" />}
                      {m.isAdmin && <StatusBadge label={tu.platformYoneticisi} tone="neutral" icon={null} size="sm" />}
                    </p>
                    {m.email && <p className="qx-caption truncate text-fg-muted">{m.email}</p>}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:max-w-[50%]">
                  {m.departmentSlugs.length === 0 && <span className="qx-caption text-warning">{tx.noDepartment}</span>}
                  {m.departmentSlugs.map((s, i) => (
                    <span key={s} className="qx-caption inline-flex items-center gap-1 rounded-chip border border-subtle bg-surface-2 py-0.5 pl-1.5 pr-0.5 text-fg">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: departments.find((d) => d.slug === s)?.color ?? 'hsl(var(--muted-foreground))' }} />
                      {i === 0 && m.departmentSlugs.length > 1 && <Star className="h-3 w-3 text-warning" aria-label={tu.birincilDepartman} />}
                      {deptName(s)}
                      {canDept && i !== 0 && (
                        <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-3" aria-label={tf.makePrimary(deptName(s))} onClick={() => void put({ id: m.id, primaryDepartment: s }, tu.birincilDepartmanGuncellendi)}>
                          <Star className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                      {canDept && (
                        <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-3" aria-label={tf.removeFromDept(dn(m), deptName(s))} onClick={() => void put({ id: m.id, removeDepartment: s }, tu.departmandanCikarildi)}>
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </span>
                  ))}
                  {canDept && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <IconButton aria-label={tf.addDeptTo(dn(m))} icon={<Plus />} size="sm" variant="outline" />
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-1" align="start">
                        <ul className="max-h-64 overflow-y-auto">
                          {departments
                            .filter((d) => d.isActive && !m.departmentSlugs.includes(d.slug))
                            .map((d) => (
                              <li key={d.slug}>
                                <button
                                  type="button"
                                  className="qx-small flex min-h-10 w-full items-center gap-2 rounded-control px-2 text-left hover:bg-surface-2"
                                  onClick={() => void put({ id: m.id, addDepartment: d.slug }, tf.addedToDept(d.name))}
                                >
                                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} /> {d.name}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canRole ? (
                    <Select value={m.teamRole ?? 'uye'} onValueChange={(v) => void put({ id: m.id, teamRole: v }, tu.rolGuncellendi)}>
                      <SelectTrigger className="h-10 w-32" aria-label={tf.teamRoleOf(dn(m))}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yonetici">{tx.roleManager}</SelectItem>
                        <SelectItem value="uye">{tx.roleMember}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge label={m.teamRole === 'yonetici' ? tu.yonetici : tu.uye2} tone={m.teamRole === 'yonetici' ? 'brand' : 'neutral'} icon={null} size="md" />
                  )}
                  {canRemove && <IconButton aria-label={tf.removeFromTeam(dn(m))} icon={<UserMinus />} size="sm" onClick={() => setRemoving(m)} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmAction
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? tf.removeFromTeamTitle(dn(removing)) : ''}
        description={tu.gorevleriSilinmezAtamalarYerinde}
        tone="warning"
        confirmLabel={tu.ekiptenCikar}
        onConfirm={async () => {
          if (!removing) return;
          await teamFetch(`${API}/members?id=${encodeURIComponent(removing.id)}`, { method: 'DELETE' });
          toast.success(tu.ekiptenCikarildi);
          setRemoving(null);
          void refresh();
        }}
      />
    </div>
  );
}

type PendingInvite = { id: string; email: string; role: string; expiresAt: string; invitedBy: { name: string | null } | null };
const INVITES_KEY = ['team', 'invitations'] as const;

/** Bekleyen ekip davetleri (kabul edilmemiş, süresi dolmamış, iptal edilmemiş) + iptal. */
function PendingInvitations({ viewer }: { viewer: ClientViewer }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: INVITES_KEY,
    queryFn: () => teamFetch<{ invitations: PendingInvite[] }>(`${API}/invitations`),
  });
  const list = q.data?.invitations ?? [];
  if (list.length === 0) return null;
  return (
    <section aria-label="Bekleyen davetler" className="rounded-card border border-subtle bg-surface-1 p-3">
      <h3 className="qx-small mb-2 font-semibold text-fg">Bekleyen davetler ({list.length})</h3>
      <ul className="space-y-1.5">
        {list.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{inv.email}</span>
            <StatusBadge label={inv.role === 'yonetici' ? 'Yönetici' : 'Üye'} tone="neutral" icon={null} size="sm" />
            <span className="qx-caption text-fg-muted">
              son: {new Date(inv.expiresAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            {(viewer.isAdmin || inv.role !== 'yonetici') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await teamFetch(`${API}/invitations?id=${encodeURIComponent(inv.id)}`, { method: 'DELETE' });
                    toast.success('Davet iptal edildi');
                    void qc.invalidateQueries({ queryKey: INVITES_KEY });
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                İptal et
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Üye ekleme. Platform yöneticisi ad/e-posta parçasıyla (≥3 karakter) arar; ekip yöneticisi
 * kişiyi TAM e-postasıyla ekler (kullanıcı tabanı listelenemez; P0-10). Rol ve departmanlar
 * eklerken seçilir (denetim #25: departman parametresi hiç verilmiyordu).
 */
function AddMember({ viewer, meta, onAdded }: { viewer: ClientViewer; meta: TeamMeta; onAdded: () => void }) {
  const dn = useDisplayName();
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<Candidate | null>(null);
  const [teamRole, setTeamRole] = useState<'uye' | 'yonetici'>('uye');
  const [depts, setDepts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      setPick(null);
      setDepts([]);
      setTeamRole('uye');
      setError(null);
      return;
    }
    const min = viewer.isAdmin ? 3 : 5;
    if (debounced.length < min) {
      setResults([]);
      setHint(null);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    setError(null);
    teamFetch<{ users: Candidate[]; hint?: string }>(`${API}/members${qs({ q: debounced })}`, { signal: ctrl.signal })
      .then((r) => {
        setResults(r.users ?? []);
        setHint(r.hint ?? null);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSearching(false);
      });
    return () => ctrl.abort();
  }, [debounced, open, viewer.isAdmin]);

  const add = async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const r = await teamFetch<{ mailSent?: boolean }>(`${API}/members`, { method: 'POST', json: { userId: pick.id, teamRole, departments: depts } });
      // Üyelik davet kabul edilince oluşur (tek kullanımlık, süreli bağlantı).
      if (r?.mailSent === false) toast.warning(`${dn(pick)} için davet oluşturuldu ama e-posta gönderilemedi. Daveti iptal edip tekrar deneyin.`);
      else toast.success(`${dn(pick)} kişisine ekip daveti gönderildi`);
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="h-11 gap-1.5 lg:ml-auto">
          <UserPlus className="h-4 w-4" aria-hidden /> {tu.uyeEkle}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,22rem)] space-y-3">
        {!pick ? (
          <>
            <label htmlFor="add-member-q" className="qx-small font-semibold text-fg">
              {viewer.isAdmin ? 'Ad ya da e-posta ile ara' : tu.kisininEPostaAdresini}
            </label>
            <Input id="add-member-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={viewer.isAdmin ? 'en az 3 karakter' : 'ornek@alan.com'} autoFocus />
            <div aria-live="polite" className="space-y-1">
              {searching && <p className="qx-caption text-fg-muted">{tx.searching}</p>}
              {hint && <p className="qx-caption text-fg-muted">{hint}</p>}
              {!searching && debounced.length >= (viewer.isAdmin ? 3 : 5) && results.length === 0 && !error && (
                <p className="qx-caption text-fg-muted">{tx.noAddable}</p>
              )}
              <ul className="max-h-56 overflow-y-auto">
                {results.map((u) => (
                  <li key={u.id}>
                    <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left hover:bg-surface-2" onClick={() => setPick(u)}>
                      <MemberAvatar user={u} size="sm" />
                      <span className="min-w-0">
                        <span className="qx-small block truncate font-medium text-fg">{dn(u)}</span>
                        <span className="qx-caption block truncate text-fg-muted">{u.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MemberAvatar user={pick} size="sm" />
              <span className="qx-small min-w-0 flex-1 truncate font-semibold">{dn(pick)}</span>
              <IconButton aria-label={tu.baskaKisiSec} icon={<X />} size="sm" onClick={() => setPick(null)} />
            </div>
            {viewer.isAdmin && (
              <Select value={teamRole} onValueChange={(v) => setTeamRole(v as 'uye' | 'yonetici')}>
                <SelectTrigger aria-label={tu.ekipRolu}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uye">{tx.roleMember}</SelectItem>
                  <SelectItem value="yonetici">{tx.roleManager}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <fieldset className="space-y-1">
              <legend className="qx-caption font-semibold text-fg-muted">{tx.deptsLegend}</legend>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {meta.departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <li key={d.slug}>
                      <label className="qx-small flex min-h-10 items-center gap-2 rounded-control px-1 hover:bg-surface-2">
                        <Checkbox checked={depts.includes(d.slug)} onCheckedChange={(v) => setDepts((cur) => (v === true ? [...cur, d.slug] : cur.filter((x) => x !== d.slug)))} />
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </label>
                    </li>
                  ))}
              </ul>
            </fieldset>
            <Button className="w-full" disabled={busy} onClick={add}>
              {busy ? 'Ekleniyor…' : 'Ekibe ekle'}
            </Button>
          </div>
        )}
        {error && <InlineError variant="banner">{error}</InlineError>}
      </PopoverContent>
    </Popover>
  );
}
