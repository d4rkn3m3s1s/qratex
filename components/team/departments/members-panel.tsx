'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { MemberAvatar, displayName } from '../shared';
import type { ClientViewer, TeamMemberRow, TeamMeta } from '../lib/types';

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
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Üye ara" aria-label="Üye ara" className="h-11 pl-9" />
        </div>
        <Select value={deptFilter} onValueChange={onDeptFilter}>
          <SelectTrigger className="h-11 lg:w-64" aria-label="Departman filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm departmanlar</SelectItem>
            <SelectItem value="none">Departmansız</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-11 lg:w-44" aria-label="Rol filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm roller</SelectItem>
            <SelectItem value="yonetici">Yönetici</SelectItem>
            <SelectItem value="uye">Üye</SelectItem>
          </SelectContent>
        </Select>
        {manage && <AddMember viewer={viewer} meta={meta} onAdded={() => void refresh()} />}
      </div>

      {rows.length === 0 ? (
        <EmptyState variant={q || role !== 'all' || deptFilter !== 'all' ? 'filtered' : 'default'} title="Üye bulunamadı" compact />
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
                      {displayName(m)}
                      {m.isSelf && <StatusBadge label="Sen" tone="brand" icon={null} size="sm" />}
                      {m.isAdmin && <StatusBadge label="Platform yöneticisi" tone="neutral" icon={null} size="sm" />}
                    </p>
                    {m.email && <p className="qx-caption truncate text-fg-muted">{m.email}</p>}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:max-w-[50%]">
                  {m.departmentSlugs.length === 0 && <span className="qx-caption text-warning">Departmansız</span>}
                  {m.departmentSlugs.map((s, i) => (
                    <span key={s} className="qx-caption inline-flex items-center gap-1 rounded-chip border border-subtle bg-surface-2 py-0.5 pl-1.5 pr-0.5 text-fg">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: departments.find((d) => d.slug === s)?.color ?? '#6b7280' }} />
                      {i === 0 && m.departmentSlugs.length > 1 && <Star className="h-3 w-3 text-warning" aria-label="Birincil departman" />}
                      {deptName(s)}
                      {canDept && i !== 0 && (
                        <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-3" aria-label={`${deptName(s)} departmanını birincil yap`} onClick={() => void put({ id: m.id, primaryDepartment: s }, 'Birincil departman güncellendi')}>
                          <Star className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                      {canDept && (
                        <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-3" aria-label={`${displayName(m)} kişisini ${deptName(s)} departmanından çıkar`} onClick={() => void put({ id: m.id, removeDepartment: s }, 'Departmandan çıkarıldı')}>
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </span>
                  ))}
                  {canDept && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <IconButton aria-label={`${displayName(m)} kişisine departman ekle`} icon={<Plus />} size="sm" variant="outline" />
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
                                  onClick={() => void put({ id: m.id, addDepartment: d.slug }, `${d.name} departmanına eklendi`)}
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
                    <Select value={m.teamRole ?? 'uye'} onValueChange={(v) => void put({ id: m.id, teamRole: v }, 'Rol güncellendi')}>
                      <SelectTrigger className="h-10 w-32" aria-label={`${displayName(m)} ekip rolü`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yonetici">Yönetici</SelectItem>
                        <SelectItem value="uye">Üye</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge label={m.teamRole === 'yonetici' ? 'Yönetici' : 'Üye'} tone={m.teamRole === 'yonetici' ? 'brand' : 'neutral'} icon={null} size="md" />
                  )}
                  {canRemove && <IconButton aria-label={`${displayName(m)} kişisini ekipten çıkar`} icon={<UserMinus />} size="sm" onClick={() => setRemoving(m)} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmAction
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `${displayName(removing)} ekipten çıkarılsın mı?` : ''}
        description="Görevleri silinmez; atamalar yerinde kalır. Ekip paneline erişimi hemen kapanır."
        tone="warning"
        confirmLabel="Ekipten çıkar"
        onConfirm={async () => {
          if (!removing) return;
          await teamFetch(`${API}/members?id=${encodeURIComponent(removing.id)}`, { method: 'DELETE' });
          toast.success('Ekipten çıkarıldı');
          setRemoving(null);
          void refresh();
        }}
      />
    </div>
  );
}

/**
 * Üye ekleme. Platform yöneticisi ad/e-posta parçasıyla (≥3 karakter) arar; ekip yöneticisi
 * kişiyi TAM e-postasıyla ekler (kullanıcı tabanı listelenemez; P0-10). Rol ve departmanlar
 * eklerken seçilir (denetim #25: departman parametresi hiç verilmiyordu).
 */
function AddMember({ viewer, meta, onAdded }: { viewer: ClientViewer; meta: TeamMeta; onAdded: () => void }) {
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
      await teamFetch(`${API}/members`, { method: 'POST', json: { userId: pick.id, teamRole, departments: depts } });
      toast.success(`${displayName(pick)} ekibe eklendi`);
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
          <UserPlus className="h-4 w-4" aria-hidden /> Üye ekle
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,22rem)] space-y-3">
        {!pick ? (
          <>
            <label htmlFor="add-member-q" className="qx-small font-semibold text-fg">
              {viewer.isAdmin ? 'Ad ya da e-posta ile ara' : 'Kişinin e-posta adresini tam yaz'}
            </label>
            <Input id="add-member-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={viewer.isAdmin ? 'en az 3 karakter' : 'ornek@alan.com'} autoFocus />
            <div aria-live="polite" className="space-y-1">
              {searching && <p className="qx-caption text-fg-muted">Aranıyor…</p>}
              {hint && <p className="qx-caption text-fg-muted">{hint}</p>}
              {!searching && debounced.length >= (viewer.isAdmin ? 3 : 5) && results.length === 0 && !error && (
                <p className="qx-caption text-fg-muted">Eklenebilir kişi bulunamadı (zaten ekipte ya da hesabı yok).</p>
              )}
              <ul className="max-h-56 overflow-y-auto">
                {results.map((u) => (
                  <li key={u.id}>
                    <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left hover:bg-surface-2" onClick={() => setPick(u)}>
                      <MemberAvatar user={u} size="sm" />
                      <span className="min-w-0">
                        <span className="qx-small block truncate font-medium text-fg">{displayName(u)}</span>
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
              <span className="qx-small min-w-0 flex-1 truncate font-semibold">{displayName(pick)}</span>
              <IconButton aria-label="Başka kişi seç" icon={<X />} size="sm" onClick={() => setPick(null)} />
            </div>
            {viewer.isAdmin && (
              <Select value={teamRole} onValueChange={(v) => setTeamRole(v as 'uye' | 'yonetici')}>
                <SelectTrigger aria-label="Ekip rolü">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uye">Üye</SelectItem>
                  <SelectItem value="yonetici">Yönetici</SelectItem>
                </SelectContent>
              </Select>
            )}
            <fieldset className="space-y-1">
              <legend className="qx-caption font-semibold text-fg-muted">Departmanlar (ilk seçilen birincil)</legend>
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
