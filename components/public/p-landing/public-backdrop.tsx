'use client';

import dynamic from 'next/dynamic';
import { Ambient } from '@/lib/motion/ambient';
import type { BackgroundEffectValue } from '@/lib/background-effect-shared';

/** Admin'in seçtiği sezonluk/özel zemin — yalnız seçiliyse ve ayrı parça olarak yüklenir. */
const DynamicBackground = dynamic(
  () => import('@/components/ui/backgrounds/dynamic-background').then((mod) => mod.DynamicBackground),
  { ssr: false, loading: () => null }
);

/**
 * Herkese açık sayfaların zemini (eski `LandingBackground`ın yerine; landing.md Bulgu 9,
 * envanter #9/#10/#49).
 *  - Varsayılan ("original"): tek statik gradyan katmanı + iki yumuşak ışık lekesi.
 *    Sonsuz JS animasyonu YOK (eskiden 40 blur'lu framer döngüsü tüm public sayfalarda dönüyordu).
 *  - Admin özel/sezonluk zemin seçtiyse: ayrı parça olarak yüklenir, `<Ambient>` içinde
 *    çalışır → sekme gizliyken ve azaltılmış harekette (OS veya uygulama ayarı) durur,
 *    yerine statik zemin kalır.
 *  - Değer sunucudan prop olarak gelir; her sayfa açılışında önbelleksiz istemci isteği yok.
 */
export function PublicBackdrop({ effect }: { effect: BackgroundEffectValue }) {
  const custom = effect !== 'original' && effect !== 'none';
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <StaticLayer subtle={effect === 'none'} />
      {custom ? (
        <Ambient className="absolute inset-0" pauseMode="unmount">
          <DynamicBackground variant={effect} fetchFromApi={false}>
            <div />
          </DynamicBackground>
        </Ambient>
      ) : null}
    </div>
  );
}

function StaticLayer({ subtle }: { subtle: boolean }) {
  return (
    <>
      <div className={subtle ? 'absolute inset-0 gradient-mesh opacity-20' : 'absolute inset-0 gradient-mesh opacity-40'} />
      {!subtle ? (
        <>
          <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-primary/15 blur-3xl dark:bg-primary/20" />
          <div className="absolute -right-32 top-[45%] h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
        </>
      ) : null}
    </>
  );
}
