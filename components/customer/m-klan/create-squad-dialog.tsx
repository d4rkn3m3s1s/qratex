'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import { SQUAD_DESCRIPTION_MAX, SQUAD_NAME_MAX, SQUAD_NAME_MIN, normalizeSquadName } from '@/lib/squads/rules';
import { squadApi, squadKeys } from './api';
import { useKlanCopy } from './copy';
import { useErrorText, useRefreshSquad } from './use-klan';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Klan adı alanı + gecikmeli müsaitlik kontrolü (sunucu kuralıyla aynı doğrulama).
 * Kur ve yeniden adlandır formları ortak kullanır.
 */
export function SquadNameField({
  value,
  onChange,
  exceptSquadId,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  exceptSquadId?: string;
  autoFocus?: boolean;
}) {
  const copy = useKlanCopy();
  const id = useId();
  const hintId = `${id}-hint`;
  const normalized = normalizeSquadName(value);
  const debounced = useDebounced(normalized, 400);
  const check = useQuery({
    queryKey: squadKeys.name(debounced, exceptSquadId),
    queryFn: () => squadApi.nameCheck(debounced, exceptSquadId),
    enabled: debounced.length >= SQUAD_NAME_MIN,
    staleTime: 30_000,
    retry: false,
  });
  const settled = debounced === normalized && normalized.length >= SQUAD_NAME_MIN;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {copy.nameLabel}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={SQUAD_NAME_MAX + 5}
        placeholder={copy.namePlaceholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-describedby={hintId}
        aria-invalid={settled && check.data ? !check.data.available : undefined}
        required
      />
      <p id={hintId} className="flex min-h-5 items-center gap-1.5 text-xs text-fg-muted" aria-live="polite">
        {!settled ? (
          <span>
            {normalized.length}/{SQUAD_NAME_MAX}
          </span>
        ) : check.isFetching ? (
          <>
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden /> {copy.nameChecking}
          </>
        ) : check.data?.available ? (
          <span className="flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {copy.nameAvailable}
          </span>
        ) : check.data ? (
          <span className="flex items-center gap-1 text-danger">
            <XCircle className="h-3.5 w-3.5" aria-hidden /> {check.data.reason}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function SloganField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const copy = useKlanCopy();
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {copy.sloganLabel}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={SQUAD_DESCRIPTION_MAX}
        rows={2}
        placeholder={copy.sloganPlaceholder}
      />
      <p className="text-right text-xs text-fg-muted">
        {value.length}/{SQUAD_DESCRIPTION_MAX}
      </p>
    </div>
  );
}

export function CreateSquadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const copy = useKlanCopy();
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  const [name, setName] = useState('');
  const [slogan, setSlogan] = useState('');
  const create = useMutation({
    mutationFn: () => squadApi.create({ name: normalizeSquadName(name), ...(slogan.trim() ? { description: slogan.trim() } : {}) }),
    onSuccess: async (r) => {
      toast.success(`${r.squad.name} ✓`);
      onOpenChange(false);
      setName('');
      setSlogan('');
      await refresh();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (normalizeSquadName(name).length < SQUAD_NAME_MIN || create.isPending) return;
    create.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{copy.createTitle}</DialogTitle>
            <DialogDescription>{copy.createDesc}</DialogDescription>
          </DialogHeader>
          <SquadNameField value={name} onChange={setName} autoFocus />
          <SloganField value={slogan} onChange={setSlogan} />
          {create.isError ? <InlineError variant="banner">{errorText(create.error)}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {copy.cancel}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={normalizeSquadName(name).length < SQUAD_NAME_MIN}>
              {copy.createSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
