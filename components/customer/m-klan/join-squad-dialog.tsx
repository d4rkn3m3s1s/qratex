'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import { normalizeInviteCode } from '@/lib/squads/rules';
import { squadApi } from './api';
import { useKlanCopy } from './copy';
import { useErrorText, useRefreshSquad } from './use-klan';

export function JoinSquadDialog({
  open,
  onOpenChange,
  initialCode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialCode?: string;
}) {
  const copy = useKlanCopy();
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  const id = useId();
  const [code, setCode] = useState(initialCode ? normalizeInviteCode(initialCode) : '');
  useEffect(() => {
    if (open && initialCode) setCode(normalizeInviteCode(initialCode));
  }, [open, initialCode]);

  const join = useMutation({
    mutationFn: () => squadApi.join(code),
    onSuccess: async (r) => {
      toast.success(`${r.name} ✓`);
      onOpenChange(false);
      setCode('');
      // Derin linki temizle: yenilemede diyalog tekrar açılmasın.
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('join')) {
          url.searchParams.delete('join');
          window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
        }
      } catch {
        /* yoksay */
      }
      await refresh();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length < 4 || join.isPending) return;
    join.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !join.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{copy.joinTitle}</DialogTitle>
            <DialogDescription>{copy.joinDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium text-fg">
              {copy.codeLabel}
            </label>
            <Input
              id={id}
              value={code}
              onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder="AB12C3"
              className="text-center font-mono text-xl tracking-[0.35em]"
              maxLength={12}
              required
            />
          </div>
          {join.isError ? <InlineError variant="banner">{errorText(join.error)}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={join.isPending}>
              {copy.cancel}
            </Button>
            <Button type="submit" loading={join.isPending} disabled={code.length < 4}>
              {copy.joinSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
