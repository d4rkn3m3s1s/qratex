'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, Tag, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmAction } from '@/components/states';
import { PRIORITY_META, STATUS_META, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/team/constants';
import { errorMessage, teamFetch } from '../lib/api';
import { API, invalidateTasks } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { displayName } from '../shared';

type Result = { affected: number; skipped: Array<{ id: string; title: string; reason: string }> };

/**
 * Toplu işlem çubuğu (yönetici). Sonuç "N güncellendi, M atlandı (gerekçe)" olarak söylenir
 * (denetim Bulgu 37: 5 seçilip 3'ü güncellenince sessiz kalıyordu). Kalıcı silme yalnız
 * arşiv görünümünde ve tipli onayla (denetim Bulgu 41: onaysız 200 göreve kadar siliyordu).
 */
export function BulkBar({ ids, archiveView, onDone }: { ids: string[]; archiveView: boolean; onDone: () => void }) {
  const { members, departments } = useWorkspace();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (action: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await teamFetch<Result>(`${API}/tasks/bulk`, { method: 'POST', json: { ids, action } });
      const skipped = res.skipped.filter((s) => s.title);
      if (skipped.length > 0) {
        toast.warning(`${res.affected} görev güncellendi, ${skipped.length} atlandı`, {
          description: skipped
            .slice(0, 4)
            .map((s) => `• ${s.title}: ${s.reason}`)
            .join('\n'),
          duration: 9000,
        });
      } else {
        toast.success(`${res.affected} görev güncellendi`);
      }
      invalidateTasks(qc);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const assignable = members.filter((m) => m.inTeam || m.isAdmin);

  return (
    <div
      role="toolbar"
      aria-label={`${ids.length} görev seçili — toplu işlemler`}
      className="sticky bottom-3 z-sticky flex flex-wrap items-center gap-2 rounded-card border border-strong bg-surface-1 p-2 qx-elevation-2"
    >
      <span className="qx-small qx-num px-1 font-semibold text-fg" aria-live="polite">
        {ids.length} seçili
      </span>
      {!archiveView ? (
        <>
          <Select disabled={busy} onValueChange={(v) => run({ op: 'status', value: v })}>
            <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Durum ata">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select disabled={busy} onValueChange={(v) => run({ op: 'priority', value: v })}>
            <SelectTrigger className="h-9 w-[8.5rem]" aria-label="Öncelik ata">
              <SelectValue placeholder="Öncelik" />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select disabled={busy} onValueChange={(v) => run({ op: 'assign', value: v === '__none' ? null : v })}>
            <SelectTrigger className="h-9 w-[10rem]" aria-label="Kişiye ata">
              <SelectValue placeholder="Ata" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Atamayı kaldır</SelectItem>
              {assignable.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {displayName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select disabled={busy} onValueChange={(v) => run({ op: 'department', value: v === '__none' ? null : v })}>
            <SelectTrigger className="h-9 w-[10rem]" aria-label="Departman ata">
              <SelectValue placeholder="Departman" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Departmansız</SelectItem>
              {departments
                .filter((d) => d.isActive)
                .map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>
                    {d.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy}>
                <Tag className="h-3.5 w-3.5" aria-hidden /> Etiket ekle
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tag.trim()) void run({ op: 'tag_add', value: tag.trim() }).then(() => setTag(''));
                }}
                className="flex gap-2"
              >
                <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="etiket" aria-label="Eklenecek etiket" maxLength={40} />
                <Button type="submit" size="sm" disabled={!tag.trim() || busy}>
                  Ekle
                </Button>
              </form>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => run({ op: 'archive', value: true })}>
            <Archive className="h-3.5 w-3.5" aria-hidden /> Arşivle
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => run({ op: 'archive', value: false })}>
            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Arşivden çıkar
          </Button>
          <Button size="sm" variant="destructive" className="h-9 gap-1.5" disabled={busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Kalıcı sil
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" className="ml-auto h-9 gap-1.5" onClick={onDone}>
        <X className="h-3.5 w-3.5" aria-hidden /> Seçimi bırak
      </Button>
      <ConfirmAction
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`${ids.length} görev kalıcı olarak silinsin mi?`}
        description="Yorumlar, alt görevler, dosyalar ve geçmiş de silinir."
        impact={[{ label: 'Silinecek görev', value: ids.length, emphasis: true }]}
        confirmPhrase="sil"
        confirmLabel="Kalıcı olarak sil"
        onConfirm={() => run({ op: 'delete' })}
      />
    </div>
  );
}
