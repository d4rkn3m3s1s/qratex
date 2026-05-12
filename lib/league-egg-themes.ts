import { CHART_HEX } from '@/lib/chart-palette';
import type { LeagueKey } from '@/lib/utils';

export type LeagueEggShellTheme = {
  bg: string;
  shellLight: string;
  shellMid: string;
  shellDark: string;
  glowPrimary: string;
  glowSecondary: string;
};

/** Sürpriz yumurta 3D kabuk renkleri — lig bazlı */
export const LEAGUE_EGG_THEME: Record<LeagueKey, LeagueEggShellTheme> = {
  BASLANGIC: {
    bg: '#1a1d23',
    shellLight: '#e8eaef',
    shellMid: CHART_HEX.slateLight,
    shellDark: CHART_HEX.slate,
    glowPrimary: CHART_HEX.slateLight,
    glowSecondary: CHART_HEX.slate200,
  },
  KOR: {
    bg: '#2b140c',
    shellLight: '#fff3e3',
    shellMid: '#f8c79d',
    shellDark: '#d98d5f',
    glowPrimary: '#ff9f4a',
    glowSecondary: '#ffcb8a',
  },
  VEYRA: {
    bg: '#141923',
    shellLight: '#f2f5ff',
    shellMid: '#cfd7e8',
    shellDark: '#9aa6bf',
    glowPrimary: '#8eb6ff',
    glowSecondary: '#b2c7e8',
  },
  SAVASCI: {
    bg: '#23190b',
    shellLight: '#fff8dd',
    shellMid: '#ffd676',
    shellDark: '#e4a741',
    glowPrimary: '#ffd24f',
    glowSecondary: '#ffef99',
  },
  ETERON: {
    bg: '#0f1d24',
    shellLight: '#e8fbff',
    shellMid: '#9ae7f4',
    shellDark: '#52b6d1',
    glowPrimary: '#54d6ff',
    glowSecondary: '#9bf2ff',
  },
  VETRA: {
    bg: '#121527',
    shellLight: '#eef0ff',
    shellMid: '#b8beff',
    shellDark: '#7d83e7',
    glowPrimary: '#8e95ff',
    glowSecondary: '#c6cbff',
  },
  ZENOR: {
    bg: '#2c0d2a',
    shellLight: '#ffeafd',
    shellMid: '#ffa7ec',
    shellDark: '#de5fbc',
    glowPrimary: '#ff7ee6',
    glowSecondary: '#ffc2f4',
  },
};

export const LEAGUE_HEADER_THEME: Record<LeagueKey, string> = {
  BASLANGIC: 'from-slate-800 via-slate-700 to-slate-900',
  KOR: 'from-amber-900 via-orange-800 to-amber-900',
  VEYRA: 'from-slate-800 via-slate-700 to-slate-900',
  SAVASCI: 'from-yellow-800 via-amber-700 to-yellow-900',
  ETERON: 'from-cyan-900 via-sky-800 to-cyan-900',
  VETRA: 'from-primary/90 via-primary/70 to-primary/95',
  ZENOR: 'from-primary/90 via-violet-950 to-primary/95',
};
