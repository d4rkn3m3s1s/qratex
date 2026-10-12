'use client';

/**
 * Listeden çıkan satırın boşluğunu yumuşakça kapatan yardımcılar.
 *
 *   <CollapseList>
 *     {items.map((it) => <CollapseItem key={it.id}>…</CollapseItem>)}
 *   </CollapseList>
 *
 * Neden `layout` değil: global LazyMotion `domAnimation` paketini yükler; `layout`
 * özelliği `domMax` ister (~+10 KB). Bunun yerine çıkan satır yüksekliğini 0'a
 * indirir — kardeşler doğal akışla yukarı kayar, ek paket gerekmez.
 *
 * Satırlar arası boşluğu kapsayıcıda `gap`/`space-y` ile DEĞİL, satırın iç öğesine
 * `mb-*` ile verin; yoksa çıkan satırın boşluğu animasyonun sonunda sıçrar.
 *
 * İlk çizimde giriş animasyonu YOK (`initial={false}`): liste yüklenince sıçramaz,
 * yalnız sonradan eklenen satır açılır, silinen/arşivlenen satır kapanır.
 * Azaltılmış harekette süre 0 (anında kaybolur).
 */
import { AnimatePresence, m as Motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode, type Ref } from 'react';
import { DURATION, EASE } from './tokens';
import { useReducedMotionPref } from './use-reduced-motion-pref';

export function CollapseList({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

type CollapseItemProps = Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'> & {
  /** Satır `li` olarak çizilsin (ul/ol içinde). */
  as?: 'div' | 'li';
};

export const CollapseItem = forwardRef<HTMLElement, CollapseItemProps>(function CollapseItem(
  { as = 'div', style, children, ...rest },
  ref,
) {
  const reduce = useReducedMotionPref();
  const props = {
    // overflow yalnız animasyon sırasında gizli — durağan hâlde odak halkası kırpılmaz.
    initial: { opacity: 0, height: 0, overflow: 'hidden' },
    animate: { opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } },
    exit: { opacity: 0, height: 0, overflow: 'hidden' },
    transition: reduce
      ? { duration: 0 }
      : {
          height: { duration: DURATION.slow, ease: EASE.standard },
          opacity: { duration: DURATION.base, ease: EASE.exit },
        },
    style,
    ...rest,
  };
  if (as === 'li')
    return (
      <Motion.li ref={ref as Ref<HTMLLIElement>} {...(props as HTMLMotionProps<'li'>)}>
        {children as ReactNode}
      </Motion.li>
    );
  return (
    <Motion.div ref={ref as Ref<HTMLDivElement>} {...props}>
      {children as ReactNode}
    </Motion.div>
  );
});
