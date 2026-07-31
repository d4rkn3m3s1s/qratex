'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Building2, Loader2, Plus, Trash2, Search, X, UserPlus, Check, Users2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { getInitials, cn } from '@/lib/utils';

type Member = {
  id: string; name: string | null; email: string; image: string | null;
  adminDepartment: string | null; adminTeamRole: string | null; departmentSlugs?: string[];
};
type Department = { id: string; slug: string; name: string; color: string; description: string | null };
type SearchUser = { id: string; name: string | null; email: string; image: string | null; role: string };

export function TeamDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDep, setNewDep] = useState('');
  const [savingDep, setSavingDep] = useState(false);

  // Üye ekleme (aranabilir kullanıcı seçici)
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team/departments', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) { setDepartments(json.departments); setMembers(json.members); }
    } catch { toast.error('Yüklenemedi'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Kullanıcı arama (isim + email, debounce 250ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!addOpen) return;
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/team/members?q=${encodeURIComponent(search.trim())}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.success) setResults(json.users);
      } catch { /* sessiz */ }
      finally { setSearching(false); }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, addOpen]);

  // Aranan kullanıcıyı ekibe ekle (üye rolüyle)
  const addMember = async (user: SearchUser, deptSlug?: string) => {
    setAddingId(user.id);
    try {
      const res = await fetch('/api/admin/team/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, departments: deptSlug ? [deptSlug] : [], teamRole: 'uye' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Eklenemedi');
      toast.success(`${user.name || user.email} ekibe eklendi`);
      setResults((prev) => prev.filter((u) => u.id !== user.id));
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setAddingId(null); }
  };

  const removeMember = async (userId: string) => {
    setMembers((p) => p.filter((m) => m.id !== userId));
    await fetch(`/api/admin/team/members?id=${userId}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  // Üyenin departman rozetini aç/kapat (çoklu) → members PUT departments dizisi
  const toggleMemberDept = async (m: Member, slug: string) => {
    const current = m.departmentSlugs ?? (m.adminDepartment ? [m.adminDepartment] : []);
    const next = current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
    setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, departmentSlugs: next, adminDepartment: next[0] ?? null } : x));
    try {
      const res = await fetch('/api/admin/team/members', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, departments: next }),
      });
      if (!res.ok) throw new Error();
    } catch { toast.error('Güncellenemedi'); load(); }
  };

  const updateRole = async (userId: string, role: string) => {
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, adminTeamRole: role } : m));
    try {
      const res = await fetch('/api/admin/team/members', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, teamRole: role }),
      });
      if (!res.ok) throw new Error();
      toast.success('Rol güncellendi');
    } catch { toast.error('Güncellenemedi'); load(); }
  };

  const addDepartment = async () => {
    if (!newDep.trim()) return;
    setSavingDep(true);
    try {
      const res = await fetch('/api/admin/team/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDep }),
      });
      if (!res.ok) throw new Error();
      toast.success('Departman eklendi'); setNewDep(''); load();
    } catch { toast.error('Eklenemedi'); }
    finally { setSavingDep(false); }
  };
  const deleteDepartment = async (slug: string) => {
    setDepartments((p) => p.filter((d) => d.slug !== slug));
    await fetch(`/api/admin/team/departments?slug=${slug}`, { method: 'DELETE' }).catch(() => {});
    load();
  };
  const seedDefaults = async () => {
    setSavingDep(true);
    try {
      const res = await fetch('/api/admin/team/departments?seed=1', { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('Varsayılan departmanlar yüklendi'); load();
    } catch { toast.error('Yüklenemedi'); }
    finally { setSavingDep(false); }
  };

  // Üye başına departman listesi (çoklu, junction'dan)
  const memberDepts = (m: Member): string[] => m.departmentSlugs ?? (m.adminDepartment ? [m.adminDepartment] : []);
  const deptBySlug = useMemo(() => Object.fromEntries(departments.map((d) => [d.slug, d])), [departments]);

  // İstatistik
  const stats = useMemo(() => {
    const managers = members.filter((m) => m.adminTeamRole === 'yonetici').length;
    const noDept = members.filter((m) => memberDepts(m).length === 0).length;
    return { total: members.length, managers, members: members.length - managers, departments: departments.length, noDept };
  }, [members, departments]);

  return (
    <div className="space-y-6 pb-12">
      <AdminPremiumHero
        eyebrow="Ekip Yönetimi"
        title="Departmanlar & Roller"
        description="Departman oluştur, ekip üyelerine birden fazla departman ve rol (Yönetici / Üye) ata."
        icon={<Building2 className="size-7" />}
        tone="auto"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" /> Yükleniyor…
        </div>
      ) : (
        <>
          {/* İstatistik şeridi */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Toplam Üye', value: stats.total, color: 'text-primary' },
              { label: 'Yönetici', value: stats.managers, color: 'text-amber-500' },
              { label: 'Departman', value: stats.departments, color: 'text-emerald-500' },
              { label: 'Departmansız', value: stats.noDept, color: 'text-slate-500' },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Departmanlar (sol, 2 kolon) */}
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5" /> Departmanlar</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Yeni departman adı" value={newDep} onChange={(e) => setNewDep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDepartment()} className="h-9" />
                  <Button size="sm" onClick={addDepartment} disabled={savingDep}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-2">
                  {departments.map((d) => {
                    const depMembers = members.filter((m) => memberDepts(m).includes(d.slug));
                    return (
                      <div key={d.slug} className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-border">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm" style={{ background: d.color }}>
                          {d.name.charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{depMembers.length} üye</p>
                        </div>
                        <div className="flex -space-x-2">
                          {depMembers.slice(0, 4).map((m) => (
                            <Avatar key={m.id} className="h-6 w-6 ring-2 ring-background">
                              {m.image ? <AvatarImage src={m.image} /> : null}
                              <AvatarFallback className="text-[8px]">{getInitials(m.name || m.email)}</AvatarFallback>
                            </Avatar>
                          ))}
                          {depMembers.length > 4 && (
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[9px] font-semibold ring-2 ring-background">+{depMembers.length - 4}</span>
                          )}
                        </div>
                        <button onClick={() => deleteDepartment(d.slug)} className="opacity-0 group-hover:opacity-100" aria-label="Sil">
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    );
                  })}
                  {departments.length === 0 && (
                    <div className="py-6 text-center">
                      <p className="mb-3 text-sm text-muted-foreground">Henüz departman yok</p>
                      <Button variant="outline" size="sm" onClick={seedDefaults} disabled={savingDep}>Varsayılan departmanları yükle (8)</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Ekip üyeleri (sağ, 3 kolon) */}
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg"><Users2 className="h-5 w-5" /> Ekip Üyeleri</CardTitle>
                {/* Aranabilir kullanıcı ekleme */}
                <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (o) setSearch(''); }}>
                  <PopoverTrigger asChild>
                    <Button size="sm"><UserPlus className="mr-1.5 h-4 w-4" /> Üye Ekle</Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="border-b border-border p-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input autoFocus placeholder="İsim veya e-posta ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8" />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-1">
                      {searching ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Aranıyor…</div>
                      ) : results.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{search ? 'Kullanıcı bulunamadı' : 'Aramak için yazın'}</p>
                      ) : results.map((u) => (
                        <button key={u.id} onClick={() => addMember(u)} disabled={addingId === u.id}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-50">
                          <Avatar className="h-8 w-8">
                            {u.image ? <AvatarImage src={u.image} /> : null}
                            <AvatarFallback className="text-[10px]">{getInitials(u.name || u.email)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{u.name || u.email.split('@')[0]}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                          </div>
                          {addingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardContent className="space-y-2">
                {members.map((m) => {
                  const mDepts = memberDepts(m);
                  return (
                    <div key={m.id} className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          {m.image ? <AvatarImage src={m.image} /> : null}
                          <AvatarFallback>{getInitials(m.name || m.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                        <Select value={m.adminTeamRole ?? 'uye'} onValueChange={(v) => updateRole(m.id, v)}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yonetici">Yönetici</SelectItem>
                            <SelectItem value="uye">Üye</SelectItem>
                          </SelectContent>
                        </Select>
                        <button onClick={() => removeMember(m.id)} aria-label="Ekipten çıkar" title="Ekipten çıkar">
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      {/* Çoklu departman rozetleri (tıkla = aç/kapat) */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
                        {mDepts.map((slug) => {
                          const d = deptBySlug[slug];
                          return (
                            <button key={slug} onClick={() => toggleMemberDept(m, slug)}
                              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white transition-opacity hover:opacity-80"
                              style={{ background: d?.color ?? '#8b5cf6' }} title="Departmandan çıkar">
                              {d?.name ?? slug} <X className="h-2.5 w-2.5" />
                            </button>
                          );
                        })}
                        {/* Departman ekle popover */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                              <Plus className="h-3 w-3" /> Departman
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-56 p-1">
                            <div className="max-h-60 overflow-y-auto">
                              {departments.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Önce departman ekle</p>}
                              {departments.map((d) => {
                                const active = mDepts.includes(d.slug);
                                return (
                                  <button key={d.slug} onClick={() => toggleMemberDept(m, d.slug)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60">
                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                                    <span className="flex-1 truncate">{d.name}</span>
                                    {active && <Check className="h-4 w-4 text-primary" />}
                                  </button>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  );
                })}
                {members.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">Henüz ekip üyesi yok. Yukarıdan "Üye Ekle" ile ekle.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
