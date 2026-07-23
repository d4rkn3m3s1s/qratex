'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Building2, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { getInitials } from '@/lib/utils';

type Member = { id: string; name: string | null; email: string; image: string | null; adminDepartment: string | null; adminTeamRole: string | null };
type Department = { id: string; slug: string; name: string; color: string; description: string | null };

export function TeamDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDep, setNewDep] = useState('');
  const [savingDep, setSavingDep] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addDep, setAddDep] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const addMember = async () => {
    if (!addEmail.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch('/api/admin/team/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), department: addDep || null, teamRole: 'uye' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Eklenemedi');
      toast.success('Üye ekibe eklendi');
      setAddEmail(''); setAddDep('');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setAddingMember(false); }
  };
  const removeMember = async (userId: string) => {
    setMembers((p) => p.map((m) => m.id === userId ? { ...m, adminDepartment: null, adminTeamRole: null } : m));
    await fetch(`/api/admin/team/members?id=${userId}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

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

  const addDepartment = async () => {
    if (!newDep.trim()) return;
    setSavingDep(true);
    try {
      const res = await fetch('/api/admin/team/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDep }),
      });
      if (!res.ok) throw new Error();
      toast.success('Departman eklendi');
      setNewDep('');
      load();
    } catch { toast.error('Eklenemedi'); }
    finally { setSavingDep(false); }
  };

  const deleteDepartment = async (slug: string) => {
    setDepartments((p) => p.filter((d) => d.slug !== slug));
    await fetch(`/api/admin/team/departments?slug=${slug}`, { method: 'DELETE' }).catch(() => {});
  };

  const seedDefaults = async () => {
    setSavingDep(true);
    try {
      const res = await fetch('/api/admin/team/departments?seed=1', { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('Varsayılan departmanlar yüklendi');
      load();
    } catch { toast.error('Yüklenemedi'); }
    finally { setSavingDep(false); }
  };

  // Üyeye departman/rol ata → ekip members PUT (ADMIN-only users route yerine; ekip yöneticisi de kullanabilir)
  const updateMember = async (userId: string, patch: { adminDepartment?: string | null; adminTeamRole?: string | null }) => {
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, ...patch } : m)));
    try {
      const res = await fetch('/api/admin/team/members', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          ...(patch.adminDepartment !== undefined ? { department: patch.adminDepartment } : {}),
          ...(patch.adminTeamRole !== undefined ? { teamRole: patch.adminTeamRole } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Güncellendi');
    } catch { toast.error('Güncellenemedi'); load(); }
  };

  return (
    <div className="space-y-6 pb-12">
      <AdminPremiumHero
        eyebrow="Ekip Yönetimi"
        title="Departmanlar & Roller"
        description="Departman oluştur, ekip üyelerine departman ve rol (Yönetici / Üye) ata."
        icon={<Building2 className="size-7" />}
        tone="auto"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" /> Yükleniyor…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Departmanlar */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Departmanlar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Yeni departman adı" value={newDep} onChange={(e) => setNewDep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDepartment()} />
                <Button onClick={addDepartment} disabled={savingDep}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2">
                {departments.map((d) => {
                  const depMembers = members.filter((m) => m.adminDepartment === d.slug);
                  return (
                    <div key={d.slug} className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-border">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: d.color }}>
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
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[9px] font-semibold ring-2 ring-background">
                            +{depMembers.length - 4}
                          </span>
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
                    <Button variant="outline" size="sm" onClick={seedDefaults} disabled={savingDep}>
                      Varsayılan departmanları yükle (8)
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ekip üyeleri (admin'ler) */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Ekip Üyeleri</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {/* E-posta ile mevcut kullanıcıyı ekibe ekle */}
              <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-dashed border-border/60 p-3">
                <Input placeholder="E-posta ile ekle…" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMember()} className="h-9 min-w-[160px] flex-1" />
                <Select value={addDep || 'none'} onValueChange={(v) => setAddDep(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Departman" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Departmansız</SelectItem>
                    {departments.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={addMember} disabled={addingMember || !addEmail.trim()}>{addingMember ? '…' : 'Ekle'}</Button>
              </div>
              {members.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-3">
                  <Avatar className="h-9 w-9">
                    {m.image ? <AvatarImage src={m.image} /> : null}
                    <AvatarFallback>{getInitials(m.name || m.email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <Select value={m.adminDepartment ?? 'none'} onValueChange={(v) => updateMember(m.id, { adminDepartment: v === 'none' ? null : v })}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Departman" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Departman —</SelectItem>
                      {departments.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={m.adminTeamRole ?? 'none'} onValueChange={(v) => updateMember(m.id, { adminTeamRole: v === 'none' ? null : v })}>
                    <SelectTrigger className="w-28"><SelectValue placeholder="Rol" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Rol —</SelectItem>
                      <SelectItem value="yonetici">Yönetici</SelectItem>
                      <SelectItem value="uye">Üye</SelectItem>
                    </SelectContent>
                  </Select>
                  {m.adminDepartment && (
                    <button onClick={() => removeMember(m.id)} aria-label="Ekipten çıkar" title="Ekipten çıkar">
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </div>
              ))}
              {members.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Admin bulunamadı</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
