'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { DEPARTMENT_COLORS } from '@/lib/team/constants';
import { errorMessage, teamFetch } from '../lib/api';
import { API, teamKeys } from '../lib/queries';
import { MemberAvatar, displayName } from '../shared';
import type { TeamDepartment, TeamMemberRow } from '../lib/types';
import { useTeamCopy } from '../copy';

type Impact = { members: number; openTasks: number; allTasks: number; templates: number; automations: number; referenced: boolean };

/**
 * Departman kartı. Yıkıcı işlemler etki önizlemeli: kullanımdaki departman silinmez,
 * arşivlenir ya da başka departmanla birleştirilir (görev, şablon, otomasyon, üyelik ve
 * birincil departman TEK işlemde taşınır; denetim Bulgu 2/3).
 */
export function DepartmentCard({
  dept,
  index,
  total,
  departments,
  members,
  manage,
  onShowMembers,
}: {
  dept: TeamDepartment;
  index: number;
  total: number;
  departments: TeamDepartment[];
  members: TeamMemberRow[];
  manage: boolean;
  onShowMembers: () => void;
}) {
  const tx = useTeamCopy();
  const qc = useQueryClient();
  const inDept = members.filter((m) => m.departmentSlugs.includes(dept.slug));
  const leads = inDept.filter((m) => m.teamRole === 'yonetici');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: teamKeys.meta });
  const patch = async (body: Record<string, unknown>, msg: string) => {
    try {
      await teamFetch(`${API}/departments?slug=${encodeURIComponent(dept.slug)}`, { method: 'PATCH', json: body });
      toast.success(msg, { description: dept.name });
      void refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  return (
    <li className={cn('relative flex flex-col gap-3 overflow-hidden rounded-card border border-subtle bg-surface-1 p-3 pl-4', !dept.isActive && 'opacity-75')}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: dept.color }} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="qx-small font-semibold text-fg">{dept.name}</h3>
          {dept.description && <p className="qx-caption mt-0.5 line-clamp-2 text-fg-muted">{dept.description}</p>}
        </div>
        {!dept.isActive && <StatusBadge label="Arşivde" tone="neutral" icon={Archive} size="sm" />}
        {manage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label={`${dept.name} için işlemler`} icon={<MoreHorizontal />} size="sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden /> Düzenle
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === 0} onSelect={() => void patch({ move: 'up' }, 'Sıra değişti')}>
                <ArrowUp className="mr-2 h-4 w-4" aria-hidden /> Yukarı taşı
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === total - 1} onSelect={() => void patch({ move: 'down' }, 'Sıra değişti')}>
                <ArrowDown className="mr-2 h-4 w-4" aria-hidden /> Aşağı taşı
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void patch({ isActive: !dept.isActive }, dept.isActive ? 'Departman arşivlendi' : 'Departman arşivden çıkarıldı')}>
                {dept.isActive ? <Archive className="mr-2 h-4 w-4" aria-hidden /> : <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden />}
                {dept.isActive ? 'Arşivle' : 'Arşivden çıkar'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Sil ya da birleştir…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="qx-caption flex flex-wrap gap-3 text-fg-muted">
        <span>
          <span className="qx-num font-semibold text-fg">{dept.memberCount}</span> üye
        </span>
        <span>
          <span className="qx-num font-semibold text-fg">{dept.openTaskCount}</span> açık görev
        </span>
        {leads.length > 0 ? (
          <span>Yönetici: {leads.map((l) => displayName(l)).join(', ')}</span>
        ) : (
          dept.isActive && <span className="text-warning">{tx.noManager}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex -space-x-2" aria-hidden>
          {inDept.slice(0, 6).map((m) => (
            <MemberAvatar key={m.id} user={m} size="sm" className="ring-2 ring-surface-1" />
          ))}
          {inDept.length > 6 && (
            <span className="qx-caption grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-fg-muted ring-2 ring-surface-1">+{inDept.length - 6}</span>
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-9 gap-1.5" onClick={onShowMembers}>
          <Users2 className="h-3.5 w-3.5" aria-hidden /> Üyeleri gör
        </Button>
      </div>

      {editOpen && <EditDialog dept={dept} onClose={() => setEditOpen(false)} onSaved={() => void refresh()} />}
      {deleteOpen && <DeleteDialog dept={dept} departments={departments} onClose={() => setDeleteOpen(false)} onDone={() => void refresh()} />}
    </li>
  );
}

function EditDialog({ dept, onClose, onSaved }: { dept: TeamDepartment; onClose: () => void; onSaved: () => void }) {
  const tx = useTeamCopy();
  const [name, setName] = useState(dept.name);
  const [desc, setDesc] = useState(dept.description ?? '');
  const [color, setColor] = useState(dept.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const palette = (DEPARTMENT_COLORS as readonly string[]).includes(dept.color) ? DEPARTMENT_COLORS : [dept.color, ...DEPARTMENT_COLORS];
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tx.editDept}</DialogTitle>
          <DialogDescription>{tx.editDeptDesc}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await teamFetch(`${API}/departments?slug=${encodeURIComponent(dept.slug)}`, {
                method: 'PATCH',
                json: { name: name.trim(), description: desc.trim() || null, color },
              });
              toast.success('Departman güncellendi');
              onSaved();
              onClose();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="qx-small block space-y-1">
            <span className="font-medium text-fg">Ad</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </label>
          <label className="qx-small block space-y-1">
            <span className="font-medium text-fg">{tx.description}</span>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={300} />
          </label>
          <div role="group" aria-label="Renk" className="flex flex-wrap gap-1.5">
            {palette.map((c) => (
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
          {error && <InlineError variant="banner">{error}</InlineError>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ dept, departments, onClose, onDone }: { dept: TeamDepartment; departments: TeamDepartment[]; onClose: () => void; onDone: () => void }) {
  const tx = useTeamCopy();
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    teamFetch<{ impact: Impact }>(`${API}/departments?impact=${encodeURIComponent(dept.slug)}`)
      .then((r) => setImpact(r.impact))
      .catch((err) => setError(errorMessage(err)));
  }, [dept.slug]);
  const targets = departments.filter((d) => d.slug !== dept.slug && d.isActive);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>"{dept.name}" silinsin mi?</DialogTitle>
          <DialogDescription>{tx.deleteDeptDesc}</DialogDescription>
        </DialogHeader>
        {!impact && !error && <p className="qx-small text-fg-muted">{tx.computingImpact}</p>}
        {impact && (
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-subtle p-3">
            {[
              ['Üye', impact.members],
              ['Açık görev', impact.openTasks],
              ['Tüm görev', impact.allTasks],
              ['Şablon', impact.templates],
              ['Otomasyon', impact.automations],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-2">
                <dt className="qx-small text-fg-muted">{k}</dt>
                <dd className="qx-small qx-num font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {impact?.referenced && (
          <div className="space-y-1">
            <span className="qx-small font-medium text-fg">{tx.moveAllTo}</span>
            <Select value={target || undefined} onValueChange={setTarget}>
              <SelectTrigger aria-label="Birleştirilecek departman">
                <SelectValue placeholder="Departman seç" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {error && <InlineError variant="banner">{error}</InlineError>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !impact || (impact.referenced && !target)}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await teamFetch(`${API}/departments?slug=${encodeURIComponent(dept.slug)}${target ? `&mergeInto=${encodeURIComponent(target)}` : ''}`, { method: 'DELETE' });
                toast.success(target ? 'Departmanlar birleştirildi' : 'Departman silindi');
                onDone();
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {impact?.referenced ? 'Birleştir ve sil' : 'Sil'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
