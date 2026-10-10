/**
 * Ortak oyun motoru — saf çekirdek (React'sız; sunucu doğrulayıcısı da kullanır).
 * React kancaları ayrı: `@/lib/games/engine/hooks` ('use client').
 * Sözleşme: lib/games/README.md
 */
export * from './rng';
export * from './loop';
export * from './canvas';
export * from './input';
export * from './record';
export * from './prefs';
