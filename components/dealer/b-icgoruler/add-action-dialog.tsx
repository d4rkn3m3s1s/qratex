'use client';

import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import { istanbulDay } from '@/components/ds/page/date-range';
import type { InsightsData, Recommendation, RecPriority } from '@/lib/dealer-insights/types';
import { useInsightsCopy } from './copy';
import { useAddAction } from './use-insights';

const UNASSIGNED = '__none__';

/**
 * "Aksiyona ekle" diyaloğu. Atanabilir kişiler sunucudan (bayi + aktif personel; e-posta yok);
 * sunucu ayrıca doğrular. Öncelik eşlemesi tek yerde (`critical` → `high`). Aynı öneri açık
 * listede varsa yeni kayıt açılmaz, kullanıcıya söylenir.
 */
export function AddActionDialog({
  rec,
  data,
  lang,
  onOpenChange,
}: {
  rec: Recommendation | null;
  data: InsightsData;
  lang: 'tr' | 'en';
  onOpenChange: (open: boolean) => void;
}) {
  const { copy } = useInsightsCopy();
  const ids = { text: useId(), priority: useId(), assignee: useId(), due: useId(), dueHint: useId() };
  const add = useAddAction(data.query, lang);
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<RecPriority>('medium');
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [due, setDue] = useState('');

  useEffect(() => {
    if (!rec) return;
    setText(rec.text);
    setPriority(rec.priority);
    setAssignee(UNASSIGNED);
    setDue('');
    add.reset();
    // add.reset kimliği kararlı değil; yalnız öneri değişince sıfırla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rec) return;
    add.mutate(
      {
        recId: rec.id,
        text: text.trim(),
        priority,
        assignedToId: assignee === UNASSIGNED ? null : assignee,
        dueDay: due || null,
        feedbackIds: rec.feedbackIds,
      },
      {
        onSuccess: (res) => {
          toast.success(res.created ? copy.dialog.created : copy.dialog.duplicate);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={!!rec} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.dialog.title}</DialogTitle>
            <DialogDescription>{copy.dialog.desc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={ids.text}>{copy.dialog.text}</Label>
            <Textarea
              id={ids.text}
              value={text}
              onChange={(e) => setText(e.target.value)}
              minLength={3}
              maxLength={500}
              required
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.priority}>{copy.dialog.priority}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as RecPriority)}>
                <SelectTrigger id={ids.priority} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {copy.recs.priority[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.assignee}>{copy.dialog.assignee}</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id={ids.assignee} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>{copy.dialog.unassigned}</SelectItem>
                  {data.assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.self ? copy.dialog.self(a.name) : a.name || copy.dialog.unnamed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.due}>{copy.dialog.due}</Label>
            <Input
              id={ids.due}
              type="date"
              value={due}
              min={istanbulDay()}
              onChange={(e) => setDue(e.target.value)}
              aria-describedby={ids.dueHint}
              className="min-h-11"
            />
            <p id={ids.dueHint} className="qx-caption text-fg-muted">
              {copy.dialog.dueHint}
            </p>
          </div>
          {add.error && (
            <InlineError variant="banner">{add.error instanceof Error && add.error.message ? add.error.message : copy.dialog.failed}</InlineError>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={add.isPending}>
              {copy.dialog.cancel}
            </Button>
            <Button type="submit" className="min-h-11" disabled={add.isPending || text.trim().length < 3}>
              {add.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              {add.isPending ? copy.dialog.submitting : copy.dialog.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
