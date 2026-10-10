'use client';

/**
 * Varsayımlar ve hedefler (yan sayfa). Varsayımlar hesabın kendisini değiştirir (geri dönüş
 * penceresi, ortalama sepet); sunucu kaydeder ve bir sonraki okuma bunlarla hesaplar. Varsayılanlar
 * sunucudan gelir (§4.4/6). Geçersiz giriş istemcide de reddedilir, sunucu zod ile yine doğrular.
 */
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { GOAL_KEYS, MAX_BASKET_TRY, RETURN_WINDOWS, type GoalKey, type ImpactSettings, type ReturnWindow } from '@/lib/dealer-impact/types';
import { cn } from '@/lib/utils';
import { useBkCopy } from './copy';
import { useSaveImpactSettings } from './use-bk';

function parseNum(raw: string): number | null | 'invalid' {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
}

export function AssumptionsSheet({ open, onOpenChange, settings }: { open: boolean; onOpenChange: (v: boolean) => void; settings: ImpactSettings }) {
  const { copy } = useBkCopy();
  const c = copy.impact.sheet;
  const id = useId();
  const save = useSaveImpactSettings();
  const [win, setWin] = useState<ReturnWindow>(settings.returnWindowDays);
  const [basket, setBasket] = useState(settings.basketTry == null ? '' : String(settings.basketTry));
  const [goals, setGoals] = useState<Record<GoalKey, string>>(() => Object.fromEntries(GOAL_KEYS.map((k) => [k, settings.goals[k] == null ? '' : String(settings.goals[k])])) as Record<GoalKey, string>);

  useEffect(() => {
    if (!open) return;
    setWin(settings.returnWindowDays);
    setBasket(settings.basketTry == null ? '' : String(settings.basketTry));
    setGoals(Object.fromEntries(GOAL_KEYS.map((k) => [k, settings.goals[k] == null ? '' : String(settings.goals[k])])) as Record<GoalKey, string>);
  }, [open, settings]);

  const basketVal = parseNum(basket);
  const basketBad = basketVal === 'invalid' || (typeof basketVal === 'number' && (basketVal <= 0 || basketVal > MAX_BASKET_TRY));
  const goalVals = Object.fromEntries(GOAL_KEYS.map((k) => [k, parseNum(goals[k])])) as Record<GoalKey, number | null | 'invalid'>;
  const goalBad = (k: GoalKey) => {
    const v = goalVals[k];
    if (v === 'invalid') return true;
    if (v == null) return false;
    return k === 'medianReplyHours' ? v < 0.25 || v > 720 : v < 0 || v > 100;
  };
  const invalid = basketBad || GOAL_KEYS.some(goalBad);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    const g: ImpactSettings['goals'] = {};
    for (const k of GOAL_KEYS) {
      const v = goalVals[k];
      if (typeof v === 'number') g[k] = v;
    }
    save.mutate(
      { returnWindowDays: win, basketTry: typeof basketVal === 'number' ? basketVal : null, goals: g },
      {
        onSuccess: () => {
          toast.success(c.saved);
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error && err.message ? err.message : copy.impact.errorTitle),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="flex min-h-full flex-col gap-6" noValidate>
          <SheetHeader>
            <SheetTitle>{c.title}</SheetTitle>
            <SheetDescription>{c.desc}</SheetDescription>
          </SheetHeader>

          <fieldset className="space-y-2">
            <legend className="qx-small font-medium text-fg">{c.window}</legend>
            <p className="qx-caption text-fg-muted">{c.windowHint}</p>
            <div role="radiogroup" aria-label={c.window} className="grid grid-cols-3 gap-2">
              {RETURN_WINDOWS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={win === d}
                  onClick={() => setWin(d)}
                  className={cn(
                    'qx-small min-h-11 rounded-control border font-medium transition-colors duration-fast ease-standard',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    win === d ? 'border-brand bg-brand/10 text-fg' : 'border-subtle text-fg-muted hover:text-fg',
                  )}
                >
                  {c.windowOption(d)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor={`${id}-basket`} className="qx-small font-medium text-fg">
              {c.basket}
            </label>
            <Input
              id={`${id}-basket`}
              inputMode="decimal"
              value={basket}
              onChange={(e) => setBasket(e.target.value)}
              aria-invalid={basketBad || undefined}
              aria-describedby={`${id}-basket-hint`}
              className="h-11"
            />
            <p id={`${id}-basket-hint`} className="qx-caption text-fg-muted">
              {c.basketHint}
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="qx-small font-medium text-fg">{c.goalsTitle}</legend>
            {GOAL_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <label htmlFor={`${id}-${k}`} className="qx-caption text-fg-muted">
                  {c.goals[k]}
                </label>
                <Input id={`${id}-${k}`} inputMode="decimal" value={goals[k]} onChange={(e) => setGoals((g) => ({ ...g, [k]: e.target.value }))} aria-invalid={goalBad(k) || undefined} className="h-11" />
              </div>
            ))}
          </fieldset>

          <SheetFooter className="mt-auto gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" className="h-11" disabled={invalid || save.isPending} aria-busy={save.isPending || undefined}>
              {c.save}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
