'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InlineError } from '@/components/states';
import { INITIATIVE_BOARD_PHASES, PHASE_META } from '@/lib/team/constants';
import { errorMessage, teamFetch } from '../lib/api';
import { API } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { displayName } from '../shared';

/** Yeni girişim (yönetici). Kilometre taşları satır satır; ilerleme bunlardan hesaplanır. */
export default function InitiativeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { members, departments } = useWorkspace();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', description: '', phase: 'next', ownerId: '', targetDate: '', department: '', milestones: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await teamFetch(`${API}/initiatives`, {
        method: 'POST',
        json: {
          title: f.title.trim(),
          description: f.description.trim() || null,
          phase: f.phase,
          ownerId: f.ownerId || null,
          targetDate: f.targetDate || null,
          department: f.department || null,
          milestones: f.milestones
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 30),
        },
      });
      toast.success('Girişim eklendi', { description: f.title.trim() });
      void qc.invalidateQueries({ queryKey: ['team', 'initiatives'] });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Yeni girişim</DialogTitle>
          <DialogDescription>Ürün yol haritasındaki bir hedef: neden, kim, ne zaman.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Başlık *" aria-label="Başlık" maxLength={200} autoFocus required />
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Açıklama" aria-label="Açıklama" rows={3} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={f.phase} onValueChange={(v) => setF({ ...f, phase: v })}>
              <SelectTrigger className="h-10" aria-label="Aşama">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INITIATIVE_BOARD_PHASES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PHASE_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={f.ownerId || '__none'} onValueChange={(v) => setF({ ...f, ownerId: v === '__none' ? '' : v })}>
              <SelectTrigger className="h-10" aria-label="Sorumlu">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sorumlu yok</SelectItem>
                {members
                  .filter((m) => m.inTeam || m.isAdmin)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {displayName(m)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} aria-label="Hedef tarih" className="h-10" />
            <Select value={f.department || '__none'} onValueChange={(v) => setF({ ...f, department: v === '__none' ? '' : v })}>
              <SelectTrigger className="h-10" aria-label="Tema departmanı">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Genel</SelectItem>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <SelectItem key={d.slug} value={d.slug}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={f.milestones}
            onChange={(e) => setF({ ...f, milestones: e.target.value })}
            placeholder={'Kilometre taşları — her satıra bir tane'}
            aria-label="Kilometre taşları (her satıra bir tane)"
            rows={4}
          />
          {error && <InlineError variant="banner">{error}</InlineError>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving || f.title.trim().length < 2}>
              {saving ? 'Ekleniyor…' : 'Girişimi ekle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
