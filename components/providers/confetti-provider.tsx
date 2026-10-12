'use client';

import React, { createContext, useContext, useMemo } from 'react';
import type { RawConfettiOptions } from '@/lib/moments/effects';

// Efekt cephesi (ses/titreşim/Capacitor dahil) kök sağlayıcıda statik değil: ilk çağrıda yüklenir (perf-2).
const loadEffects = () => import('@/lib/moments/effects');

/**
 * `useConfetti()` — geriye uyumlu bağlam. Tüm efektler An Motoru'nun TEK efekt
 * cephesine (`lib/moments/effects.ts`) delege edilir: canvas-confetti orada lazy
 * yüklenir ve azaltılmış harekette (OS VEYA `html.reduce-animations`) hiçbiri çalmaz.
 *
 * Ödül anları (puan/seviye/lig/rozet) için bunu değil `moments.points()` /
 * `moments.refresh()` kullanın.
 */
interface ConfettiContextType {
    fire: (options?: RawConfettiOptions) => void;
    fireSchoolPride: () => void;
    fireStars: () => void;
    fireFireworks: () => void;
}

const DEFAULT_FIRE: RawConfettiOptions = {
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#9333ea', '#c084fc', '#f0abfc', '#ffffff'],
};

const VALUE: ConfettiContextType = {
    fire: (options) => {
        void loadEffects().then((e) => e.confettiRaw({ ...DEFAULT_FIRE, ...options }));
    },
    fireSchoolPride: () => {
        void loadEffects().then((e) => e.confetti('pride'));
    },
    fireStars: () => {
        void loadEffects().then((e) => e.confetti('stars'));
    },
    fireFireworks: () => {
        void loadEffects().then((e) => e.confetti('fireworks'));
    },
};

const ConfettiContext = createContext<ConfettiContextType | undefined>(undefined);

export function ConfettiProvider({ children }: { children: React.ReactNode }) {
    const value = useMemo(() => VALUE, []);
    return <ConfettiContext.Provider value={value}>{children}</ConfettiContext.Provider>;
}

export const useConfetti = () => {
    const context = useContext(ConfettiContext);
    if (!context) {
        throw new Error('useConfetti must be used within a ConfettiProvider');
    }
    return context;
};
