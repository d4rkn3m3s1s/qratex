'use client';

import { Building2, Check, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthCopy } from './copy';

export type SignupRole = 'CUSTOMER' | 'DEALER';

/**
 * Hesap türü seçimi — gerçek radyo grubu (yerel `<input type="radio">`): ok tuşlarıyla gezinme,
 * ekran okuyucuda "2'nin 1'i, seçili" duyurusu kendiliğinden gelir. Eskiden `aria-pressed`
 * butonlardı (tek seçimli grupta yanlış semantik).
 */
export function RolePicker({ value, onChange, disabled }: { value: SignupRole; onChange: (r: SignupRole) => void; disabled?: boolean }) {
  const copy = useAuthCopy();
  const options: Array<{ value: SignupRole; label: string; desc: string; Icon: typeof User }> = [
    { value: 'CUSTOMER', label: copy.roleCustomer, desc: copy.roleCustomerDesc, Icon: User },
    { value: 'DEALER', label: copy.roleDealer, desc: copy.roleDealerDesc, Icon: Building2 },
  ];
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="qx-small mb-2 font-medium text-fg">{copy.roleLegend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value: v, label, desc, Icon }) => {
          const selected = value === v;
          return (
            <label
              key={v}
              className={cn(
                'relative flex min-h-[6.5rem] cursor-pointer flex-col gap-1.5 rounded-control border p-3 transition-colors duration-150',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected ? 'border-brand bg-brand-subtle' : 'border-border bg-surface-1 hover:border-brand-border',
              )}
            >
              <input
                type="radio"
                name="account-role"
                value={v}
                checked={selected}
                onChange={() => onChange(v)}
                className="sr-only"
              />
              <span className="flex items-center justify-between">
                <Icon className={cn('h-5 w-5', selected ? 'text-brand' : 'text-fg-muted')} aria-hidden />
                <span
                  className={cn(
                    'grid h-5 w-5 place-items-center rounded-full border',
                    selected ? 'border-brand bg-brand text-brand-fg' : 'border-strong',
                  )}
                  aria-hidden
                >
                  {selected ? <Check className="h-3 w-3" /> : null}
                </span>
              </span>
              <span className="qx-small font-semibold text-fg">{label}</span>
              <span className="qx-caption text-fg-muted text-pretty">{desc}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
