import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DEFAULT_LEAGUE_RULES,
  getLeagueMetaFromRules,
  getNextLeagueMetaFromRules,
  getLeagueProgressFromRules,
  type LeagueKey,
  type LeagueRule,
} from '@/lib/league-rules-core';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale: 'tr' | 'en' = 'tr',
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const localeTag = locale === 'en' ? 'en-US' : 'tr-TR';
  return new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(d);
}

export function formatRelativeTime(
  date: Date | string | null | undefined,
  locale: 'tr' | 'en' = 'tr',
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (locale === 'en') {
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    if (days < 7) return `${days} days ago`;
    if (weeks < 4) return `${weeks} wk ago`;
    if (months < 12) return `${months} mo ago`;
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  }

  if (seconds < 60) return 'Az önce';
  if (minutes < 60) return `${minutes} dakika önce`;
  if (hours < 24) return `${hours} saat önce`;
  if (days < 7) return `${days} gün önce`;
  if (weeks < 4) return `${weeks} hafta önce`;
  if (months < 12) return `${months} ay önce`;
  return formatDate(d);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('tr-TR').format(num);
}

export function formatCurrency(amount: number, currency: string = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

export function calculateLevel(xp: number, xpPerLevel: number = 1000, multiplier: number = 1.5): number {
  let level = 1;
  let requiredXp = xpPerLevel;
  let totalXp = 0;

  while (totalXp + requiredXp <= xp) {
    totalXp += requiredXp;
    level++;
    requiredXp = Math.floor(xpPerLevel * Math.pow(multiplier, level - 1));
  }

  return level;
}

export function calculateXpToNextLevel(xp: number, xpPerLevel: number = 1000, multiplier: number = 1.5): number {
  let level = 1;
  let requiredXp = xpPerLevel;
  let totalXp = 0;

  while (totalXp + requiredXp <= xp) {
    totalXp += requiredXp;
    level++;
    requiredXp = Math.floor(xpPerLevel * Math.pow(multiplier, level - 1));
  }

  return totalXp + requiredXp - xp;
}

export function calculateLevelProgress(xp: number, xpPerLevel: number = 1000, multiplier: number = 1.5): number {
  let level = 1;
  let requiredXp = xpPerLevel;
  let totalXp = 0;

  while (totalXp + requiredXp <= xp) {
    totalXp += requiredXp;
    level++;
    requiredXp = Math.floor(xpPerLevel * Math.pow(multiplier, level - 1));
  }

  const currentLevelXp = xp - totalXp;
  return (currentLevelXp / requiredXp) * 100;
}

/** Lig: tek kaynak lib/league-rules (DB/Admin). Client fallback: DEFAULT_LEAGUE_RULES. */
export type { LeagueKey };
export type LeagueMeta = LeagueRule;

/** Lig ismi; client tarafında varsayılan kurallarla. API'den gelen league kullanıldığında tercih edin. */
export function getLeague(points: number): string {
  return getLeagueMetaFromRules(points, DEFAULT_LEAGUE_RULES).name;
}

export function getLeagueMetaByPoints(points: number): LeagueMeta {
  return getLeagueMetaFromRules(points, DEFAULT_LEAGUE_RULES);
}

export function getLeagueMeta(levelOrPoints: number): LeagueMeta {
  return getLeagueMetaByPoints(levelOrPoints);
}

export function getNextLeagueMetaByPoints(points: number): LeagueMeta | null {
  return getNextLeagueMetaFromRules(points, DEFAULT_LEAGUE_RULES);
}

export function getNextLeagueMeta(levelOrPoints: number): LeagueMeta | null {
  return getNextLeagueMetaByPoints(levelOrPoints);
}

export function getLeagueProgressByPoints(points: number): number {
  return getLeagueProgressFromRules(points, DEFAULT_LEAGUE_RULES);
}

export function getLeagueProgress(levelOrPoints: number): number {
  return getLeagueProgressByPoints(levelOrPoints);
}

export function generateQRCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Fiziksel kart için güvenli, benzersiz token üretir
 * 21 karakter uzunluğunda, ~126 bit entropi
 * URL-safe karakterler kullanır
 */
export function generateCardToken(prefix?: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const tokenLength = 21;
  let token = '';
  
  // Crypto API varsa kullan (daha güvenli)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(tokenLength);
    crypto.getRandomValues(array);
    for (let i = 0; i < tokenLength; i++) {
      token += chars[array[i] % chars.length];
    }
  } else {
    // Fallback to Math.random
    for (let i = 0; i < tokenLength; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  
  return prefix ? `${prefix}_${token}` : token;
}

/**
 * Batch için benzersiz ID üretir
 */
export function generateBatchId(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BATCH_${dateStr}_${randomPart}`;
}

/**
 * Kart durumunu Türkçe'ye çevirir
 */
export function getCardStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    UNUSED: 'Aktive Edilmemiş',
    ACTIVATED: 'Aktif',
    BLOCKED: 'Bloklanmış',
  };
  return labels[status] || status;
}

/**
 * Kart durumu için renk döndürür
 */
export function getCardStatusColor(status: string): string {
  const colors: Record<string, string> = {
    UNUSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    ACTIVATED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    BLOCKED: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[status] || colors.UNUSED;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getRarityColor(rarity: string): string {
  const colors: Record<string, string> = {
    common: 'bg-slate-600 text-slate-100',
    rare: 'bg-blue-600 text-blue-100',
    epic: 'bg-primary text-primary-foreground',
    legendary: 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white',
    COMMON: 'bg-slate-600 text-slate-100',
    RARE: 'bg-blue-600 text-blue-100',
    EPIC: 'bg-primary text-primary-foreground',
    LEGENDARY: 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white',
  };
  return colors[rarity] || colors.common;
}

export function getRarityBgColor(rarity: string): string {
  const colors: Record<string, string> = {
    common: 'bg-slate-500/30',
    rare: 'bg-blue-500/40',
    epic: 'bg-primary/40',
    legendary: 'bg-gradient-to-br from-yellow-500/50 via-orange-500/50 to-red-500/50',
    COMMON: 'bg-slate-500/30',
    RARE: 'bg-blue-500/40',
    EPIC: 'bg-primary/40',
    LEGENDARY: 'bg-gradient-to-br from-yellow-500/50 via-orange-500/50 to-red-500/50',
  };
  return colors[rarity] || colors.common;
}

export function getSentimentColor(sentiment: string): string {
  const colors: Record<string, string> = {
    positive: 'text-green-400',
    negative: 'text-red-400',
    neutral: 'text-gray-400',
  };
  return colors[sentiment] || colors.neutral;
}

export function getSentimentEmoji(sentiment: string): string {
  const emojis: Record<string, string> = {
    positive: '😊',
    negative: '😞',
    neutral: '😐',
  };
  return emojis[sentiment] || emojis.neutral;
}

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Bir hata oluştu';
}

