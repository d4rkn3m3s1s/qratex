/**
 * Canvas tabanlı dekor arka planları — tek kaynak hex dizileri (sıra korunur).
 */

/** Doğum günü: balon ve konfeti ortak önek */
const BIRTHDAY_CORE = [
  '#ff6b6b',
  '#4ecdc4',
  '#ffe66d',
  '#95e1d3',
  '#f38181',
  '#aa96da',
  '#fcbad3',
] as const;

export const BIRTHDAY_BALLOON_COLORS: readonly string[] = [...BIRTHDAY_CORE, '#a8d8ea'];

export const BIRTHDAY_CONFETTI_COLORS: readonly string[] = [
  ...BIRTHDAY_CORE,
  '#ff9f43',
  '#00d2d3',
  '#54a0ff',
];

/** Galaxy spiral kolları — dört kol × üç ton */
export const GALAXY_SPIRAL_ARM_COLORS = [
  ['#ff6b9d', '#c44569', '#ff8a5c'],
  ['#9b59b6', '#8e44ad', '#a569bd'],
  ['#3498db', '#2980b9', '#5dade2'],
  ['#1abc9c', '#16a085', '#48c9b0'],
] as const;

export const VALENTINE_HEART_COLORS_DARK = [
  '#ff1744',
  '#ff4081',
  '#f50057',
  '#ff80ab',
  '#ff5252',
  '#e91e63',
] as const;

export const VALENTINE_HEART_COLORS_LIGHT = [
  '#e91e63',
  '#c2185b',
  '#ad1457',
  '#880e4f',
  '#d81b60',
  '#f06292',
] as const;

/** Noel ampul zinciri */
export const CHRISTMAS_LIGHT_BULB_COLORS = [
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#ff6600',
] as const;

/** Nebula — HEX_WHITE dışı yıldız tonları */
export const NEBULA_STAR_ACCENT_COLORS = ['#ffe4c4', '#b0c4de', '#ffd700', '#ff69b4'] as const;

/** Fireflies — amber turuncu paleti */
export const FIREFLIES_COLORS_DARK = ['#fbbf24', '#f59e0b', '#d97706', '#fcd34d', '#fef3c7'] as const;

export const FIREFLIES_COLORS_LIGHT = ['#ea580c', '#c2410c', '#9a3412', '#f97316', '#fb923c'] as const;
