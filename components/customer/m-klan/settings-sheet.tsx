'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChoiceChips } from '@/components/ds/a11y';
import { ConfirmAction, InlineError } from '@/components/states';
import { SQUAD_NAME_MIN, WEEKLY_GOAL_TIERS, normalizeSquadName, type WeeklyGoalTier } from '@/lib/squads/rules';
import type { SquadDto } from '@/lib/squads/dto';
import { squadApi } from './api';
import { useKlanCopy } from './copy';
import { SloganField, SquadNameField } from './create-squad-dialog';
import { useConfirmRunner, useErrorText, useRefreshSquad } from './use-klan';

/** Lider paneli: ad, slogan, haftalık hedef kademesi, davet kodu yenileme (envanter 31, Bulgu 12). */
export function SettingsSheet({
  open,
  onOpenChange,
  squad,
  goalTier,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  squad: SquadDto;
  goalTier: WeeklyGoalTier;
}) {
  const copy = useKlanCopy();
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  const run = useConfirmRunner();
  const tierLabelId = useId();
  const [name, setName] = useState(squad.name);
  const [slogan, setSlogan] = useState(squad.description ?? '');
  const [tier, setTier] = useState<WeeklyGoalTier>(goalTier);

  useEffect(() => {
    if (open) {
      setName(squad.name);
      setSlogan(squad.description ?? '');
      setTier(goalTier);
    }
  }, [open, squad.name, squad.description, goalTier]);

  const save = useMutation({
    mutationFn: () => {
      const patch: { name?: string; description?: string | null; goalTier?: WeeklyGoalTier } = {};
      const n = normalizeSquadName(name);
      if (n !== squad.name) patch.name = n;
      const s = slogan.trim();
      if (s !== (squad.description ?? '')) patch.description = s ? s : null;
      if (tier !== goalTier) patch.goalTier = tier;
      return squadApi.update(squad.id, patch);
    },
    onSuccess: async () => {
      toast.success(copy.saved);
      onOpenChange(false);
      await refresh();
    },
  });

  const dirty =
    normalizeSquadName(name) !== squad.name || slogan.trim() !== (squad.description ?? '') || tier !== goalTier;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || normalizeSquadName(name).length < SQUAD_NAME_MIN || save.isPending) return;
    save.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>{copy.settingsTitle}</SheetTitle>
          <SheetDescription>{copy.settingsDesc}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
          <fieldset className="space-y-4" disabled={squad.isFrozen}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.identitySection}</legend>
            <SquadNameField value={name} onChange={setName} exceptSquadId={squad.id} />
            <SloganField value={slogan} onChange={setSlogan} />
            <div className="space-y-2">
              <p id={tierLabelId} className="text-sm font-medium text-fg">
                {copy.tierLabel}
              </p>
              <ChoiceChips
                aria-labelledby={tierLabelId}
                options={([1, 2, 3] as const).map((t) => {
                  const key = WEEKLY_GOAL_TIERS[t].key;
                  return {
                    value: String(t),
                    label: (
                      <span className="flex flex-col items-start leading-tight">
                        <span>{copy.tiers[key].label}</span>
                        <span className="text-[11px] opacity-80">{copy.tiers[key].hint(WEEKLY_GOAL_TIERS[t].reward)}</span>
                      </span>
                    ),
                    textLabel: `${copy.tiers[key].label}, ${copy.tiers[key].hint(WEEKLY_GOAL_TIERS[t].reward)}`,
                  };
                })}
                value={String(tier)}
                onChange={(v) => v && setTier(Number(v) as WeeklyGoalTier)}
                register="play"
              />
            </div>
          </fieldset>
          {squad.isFrozen ? <InlineError variant="banner" tone="warning">{copy.frozenBody}</InlineError> : null}
          {save.isError ? <InlineError variant="banner">{errorText(save.error)}</InlineError> : null}
          <Button type="submit" className="w-full" loading={save.isPending} disabled={!dirty || squad.isFrozen}>
            {copy.save}
          </Button>
        </form>

        <section className="mt-8 space-y-2 border-t border-subtle pt-6" aria-labelledby={`${tierLabelId}-inv`}>
          <h3 id={`${tierLabelId}-inv`} className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {copy.inviteSection}
          </h3>
          <p className="font-mono text-lg font-bold tracking-[0.25em] text-fg">{squad.inviteCode}</p>
          <ConfirmAction
            tone="warning"
            trigger={
              <Button variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4" aria-hidden /> {copy.rotateCode}
              </Button>
            }
            title={copy.rotateTitle}
            description={copy.rotateBody}
            confirmLabel={copy.rotateCode}
            onConfirm={() => run(() => squadApi.rotateCode(squad.id), () => copy.rotated)}
          />
        </section>
      </SheetContent>
    </Sheet>
  );
}
