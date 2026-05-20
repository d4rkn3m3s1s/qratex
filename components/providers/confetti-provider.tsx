'use client';

import React, { createContext, useContext, useCallback } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiContextType {
    fire: (options?: confetti.Options) => void;
    fireSchoolPride: () => void;
    fireStars: () => void;
    fireFireworks: () => void;
}

const ConfettiContext = createContext<ConfettiContextType | undefined>(undefined);

export function ConfettiProvider({ children }: { children: React.ReactNode }) {
    const fire = useCallback((options?: confetti.Options) => {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#9333ea', '#c084fc', '#f0abfc', '#ffffff'],
            ...options,
        });
    }, []);

    const fireSchoolPride = useCallback(() => {
        const end = Date.now() + 3 * 1000;
        const colors = ['#9333ea', '#ffffff'];

        (function frame() {
            confetti({
                particleCount: 2,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: colors,
            });
            confetti({
                particleCount: 2,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: colors,
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }, []);

    const fireStars = useCallback(() => {
        const defaults = {
            spread: 360,
            ticks: 50,
            gravity: 0,
            decay: 0.94,
            startVelocity: 30,
            shapes: ['star'],
            colors: ['FFE400', 'FFBD00', 'E89400', 'FFCA6C', 'FDFFB8']
        };

        function shoot() {
            confetti({
                ...defaults,
                particleCount: 40,
                scalar: 1.2,
                shapes: ['star']
            });

            confetti({
                ...defaults,
                particleCount: 10,
                scalar: 0.75,
                shapes: ['circle']
            });
        }

        setTimeout(shoot, 0);
        setTimeout(shoot, 100);
        setTimeout(shoot, 200);
    }, []);

    const fireFireworks = useCallback(() => {
        const duration = 5 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        function randomInRange(min: number, max: number) {
            return Math.random() * (max - min) + min;
        }

        const interval: any = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            // since particles fall down, start a bit higher than random
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    }, []);

    return (
        <ConfettiContext.Provider value={{ fire, fireSchoolPride, fireStars, fireFireworks }}>
            {children}
        </ConfettiContext.Provider>
    );
}

export const useConfetti = () => {
    const context = useContext(ConfettiContext);
    if (!context) {
        throw new Error('useConfetti must be used within a ConfettiProvider');
    }
    return context;
};
