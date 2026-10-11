'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FAMILY_GROUP_LABEL, THEME_FAMILIES, type FamilyGroup, type Palette } from '@/lib/design-system/theme-model';
import { useDesignSystemCopy } from '../copy';

function Strip({ p, label }: { p: Palette; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="qx-caption w-9 shrink-0 text-fg-subtle">{label}</span>
      <span className="flex h-5 flex-1 overflow-hidden rounded-chip border border-strong/30" aria-hidden>
        <span className="w-2/5" style={{ background: p.background }} />
        <span className="flex-1" style={{ background: p.primary }} />
        <span className="flex-1" style={{ background: p.secondary }} />
        <span className="flex-1" style={{ background: p.accent }} />
      </span>
    </span>
  );
}

const GROUPS: FamilyGroup[] = ['brand', 'cool', 'warm', 'vivid'];

/**
 * Hazır paletler — `radiogroup`: ok tuşlarıyla gezinme, Space/Enter ile seçim (seçim yalnız
 * taslağı değiştirir; yayın ayrı adım). Kayan seçim çerçevesi `layoutId` ile (azaltılmış
 * harekette global MotionConfig kapatır).
 */
export function FamilyPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const ux = useDesignSystemCopy().ui;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const order = GROUPS.flatMap((g) => THEME_FAMILIES.filter((f) => f.group === g));
  const activeIndex = Math.max(0, order.findIndex((f) => f.id === value));

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % order.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + order.length) % order.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(order[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ux.hazirPaletler} aria-disabled={disabled || undefined} className="space-y-5">
      {GROUPS.map((g) => {
        const fams = order.filter((f) => f.group === g);
        if (!fams.length) return null;
        return (
          <div key={g} className="space-y-2" role="presentation">
            <p className="qx-overline text-fg-muted" aria-hidden>
              {FAMILY_GROUP_LABEL[g]}
            </p>
            <div className="grid gap-2 sm:grid-cols-2" role="presentation">
              {fams.map((f) => {
                const index = order.indexOf(f);
                const selected = f.id === value;
                return (
                  <button
                    key={f.id}
                    ref={(el) => {
                      refs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${f.name} — ${f.note}`}
                    tabIndex={index === activeIndex ? 0 : -1}
                    disabled={disabled}
                    onClick={() => onChange(f.id)}
                    onKeyDown={(e) => onKey(e, index)}
                    className={cn(
                      'relative min-h-11 space-y-2 rounded-card border bg-surface-1 p-3 text-left transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      selected ? 'border-brand-border' : 'hover:border-strong',
                    )}
                  >
                    {selected && (
                      <Motion.span
                        layoutId="ds-family-selected"
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-card ring-2 ring-brand"
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      />
                    )}
                    <span className="flex items-center justify-between gap-2">
                      <span className="qx-small font-semibold text-fg">{f.name}</span>
                      {selected && <Check className="h-4 w-4 text-brand" aria-hidden />}
                    </span>
                    <span className="qx-caption block text-fg-muted">{f.note}</span>
                    <Strip p={f.variants.light} label={ux.acik2} />
                    <Strip p={f.variants.dark} label={ux.koyu} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
