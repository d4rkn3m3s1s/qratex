'use client';

import { cn } from '@/lib/utils';
import { useRegisterContext, type Register } from '../play/register';
import { SectionCard as StateSectionCard, type SectionCardProps as StateSectionCardProps } from '@/components/states';

export type SectionCardProps = StateSectionCardProps & {
  /** Çapa kimliği (`#ayarlar` derin linki); yapışık başlık için kaydırma payı bırakır. */
  id?: string;
  /**
   * Verilmezse en yakın `RegisterProvider` (ör. `PanelPage register`), o da yoksa `ops`.
   * `ops`: düz `surface-1`, elevation 1.
   * `play`: marka kenarı + elevation 2 (müşteri ödül/oyun yüzeyleri).
   */
  register?: Register;
};

/**
 * Bölüm kartı — `components/states` SectionCard'ının (landmark `section`,
 * başlık seviyesi, ton şeridi, yoğunluk) üstüne çapa ve kayıt desteği.
 */
export function SectionCard({ id, register: registerProp, className, ...rest }: SectionCardProps) {
  const ctxRegister = useRegisterContext();
  const register = registerProp ?? ctxRegister ?? 'ops';
  const card = (
    <StateSectionCard
      {...rest}
      className={cn(register === 'play' && 'border-brand-border/60 qx-elevation-2', className)}
    />
  );
  if (!id) return card;
  return (
    <div id={id} className="min-w-0 scroll-mt-24">
      {card}
    </div>
  );
}
