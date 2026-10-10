'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { DEPARTMENT_COLORS } from '@/lib/team/constants';
import { errorMessage, teamFetch } from '../lib/api';
import { API, teamKeys, useTags } from '../lib/queries';

/**
 * Etiket havuzu (yönetici). Artık gerçekten kullanılır: görev formunda öneri, kartta renk
 * (denetim SAHTE #16). Silme hatası görünür.
 */
export default function TagsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const list = useTags();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<string>(DEPARTMENT_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: teamKeys.tags });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etiket havuzu</DialogTitle>
          <DialogDescription>Görev formunda öneri olarak çıkar, kartlarda bu renkle gösterilir.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim()) return;
            setBusy(true);
            try {
              await teamFetch(`${API}/tags`, { method: 'POST', json: { label: label.trim(), color } });
              setLabel('');
              void refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiket adı" aria-label="Etiket adı" maxLength={40} />
            <Button type="submit" className="shrink-0 gap-1.5" disabled={busy || !label.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> Ekle
            </Button>
          </div>
          <div role="group" aria-label="Etiket rengi" className="flex flex-wrap gap-1.5">
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
        </form>
        <QueryState query={list} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ compact: true, title: 'Havuz boş', description: 'Sık kullandığın etiketleri ekle.' }}>
          {(d) => (
            <ul className="divide-y divide-[hsl(var(--border-subtle))] rounded-card border border-subtle">
              {d.items.map((t) => (
                <li key={t.slug} className="flex items-center gap-2 px-3 py-1.5">
                  <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="qx-small flex-1 text-fg">#{t.label}</span>
                  <IconButton
                    aria-label={`#${t.label} etiketini havuzdan kaldır`}
                    icon={<Trash2 />}
                    size="sm"
                    onClick={async () => {
                      try {
                        await teamFetch(`${API}/tags?slug=${encodeURIComponent(t.slug)}`, { method: 'DELETE' });
                        void refresh();
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
