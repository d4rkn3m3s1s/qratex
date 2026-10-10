'use client';

/**
 * Panel kabuğu bağlamı: sunucuda çözülen `ShellConfig` + kabuk içi açık/kapalı
 * durumları (mobil menü çekmecesi, ⌘K paleti, ⌘J asistan). Sidebar, başlık ve alt
 * sekme çubuğu kardeş bileşenler olduğundan durum burada tutulur.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useAppLocale } from '@/lib/app-locale';
import type { Bilingual } from '@/lib/navigation/registry';
import type { ShellConfig } from '@/lib/navigation/shell-config';

type ShellContextValue = {
  shell: ShellConfig;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ shell, children }: { shell: ShellConfig; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const value = useMemo(
    () => ({ shell, navOpen, setNavOpen, paletteOpen, setPaletteOpen, assistantOpen, setAssistantOpen }),
    [shell, navOpen, paletteOpen, assistantOpen]
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Sağlayıcı dışında `null` döner (ör. başlığın kabuk dışı kullanımı). */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext);
}

/** İki dilli etiketi etkin dile çevirir. */
export function useBilingual() {
  const { locale } = useAppLocale();
  return useCallback((b: Bilingual) => (locale === 'en' ? b.en : b.tr), [locale]);
}

/** `teamOnly` öğeler: ADMIN her zaman, diğerleri yalnız ekip rolü atanmışsa görür. */
export function useCanSeeTeam(): boolean {
  const { data: session } = useSession();
  const user = session?.user as { role?: string; adminTeamRole?: string | null } | undefined;
  return user?.role === 'ADMIN' || !!user?.adminTeamRole;
}
