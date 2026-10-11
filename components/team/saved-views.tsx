'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconButton } from '@/components/ds/a11y';
import { errorMessage, teamFetch } from './lib/api';
import { API, teamKeys, useViews } from './lib/queries';
import { useWorkspace } from './workspace-context';
import { useTeamCopy } from './copy';

export const VIEW_KEYS = ['tab', 'department', 'status', 'priority', 'assignedTo', 'tag', 'q', 'mine', 'sort', 'group'] as const;

/**
 * Kayıtlı görünümler — ad satır içi formla alınır (denetim D4: `window.prompt`), ekiple
 * paylaşma yöneticide (#36), başkasının paylaştığı görünümde sil düğmesi yok (#35), uygulama
 * URL'yi değiştirir → görünüm bağlantıyla paylaşılabilir (#34).
 */
export function SavedViews({ current, onApply }: { current: Record<string, string>; onApply: (config: Record<string, string>) => void }) {
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { can } = useWorkspace();
  const qc = useQueryClient();
  const views = useViews();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const config = Object.fromEntries(Object.entries(current).filter(([k, v]) => (VIEW_KEYS as readonly string[]).includes(k) && v));
      await teamFetch(`${API}/views`, { method: 'POST', json: { name: name.trim(), config, isShared: shared } });
      toast.success(tu.gorunumKaydedildi);
      setName('');
      setShared(false);
      void qc.invalidateQueries({ queryKey: teamKeys.views });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await teamFetch(`${API}/views?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: teamKeys.views });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const items = views.data?.items ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11 gap-1.5 sm:h-10">
          <Bookmark className="h-4 w-4" aria-hidden /> {tu.gorunumler}
          {items.length > 0 && <span className="qx-caption qx-num text-fg-muted">{items.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        {views.isError && <p className="qx-caption text-danger">{errorMessage(views.error)}</p>}
        {items.length === 0 && !views.isLoading && <p className="qx-caption text-fg-muted">{tx.noSavedViews}</p>}
        {items.length > 0 && (
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {items.map((v) => (
              <li key={v.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="qx-small flex min-h-10 flex-1 items-center gap-1.5 rounded-control px-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onApply(v.config);
                    setOpen(false);
                  }}
                >
                  {v.isShared && <Users className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-label={tu.ekiplePaylasilan} />}
                  <span className="truncate">{v.name}</span>
                  {!v.mine && v.ownerName && <span className="qx-caption truncate text-fg-muted">· {v.ownerName}</span>}
                </button>
                {v.mine && <IconButton aria-label={`${v.name} görünümünü sil`} icon={<Trash2 />} size="sm" onClick={() => void remove(v.id)} />}
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-2 border-t border-subtle pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="team-view-name" className="qx-caption font-semibold text-fg">
            {tu.suAnkiFiltreleriKaydet}
          </label>
          <Input id="team-view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tu.gorunumAdi} maxLength={60} />
          {can.shareViews && (
            <label className="qx-small flex items-center gap-2">
              <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} /> {tu.ekiplePaylas}
            </label>
          )}
          <Button type="submit" size="sm" className="h-9 w-full" disabled={busy || !name.trim()}>
            Kaydet
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
