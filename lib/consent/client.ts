'use client';

/**
 * İstemci rıza deposu + `useConsent` kancası.
 *
 *   const { decided, has, acceptAll, rejectOptional, save, openPreferences } = useConsent();
 *   if (has('analytics')) initPostHog();
 *
 * - Kaynak: birinci taraf `qx_consent` çerezi (sunucu da okuyabilir). Eski localStorage
 *   kaydı ilk okumada taşınır.
 * - Aynı sekmede `qx-consent-change` olayı, sekmeler arası `BroadcastChannel` ile senkron.
 * - SSR'da (ve hidrasyon öncesi) `ready=false` + yalnız `necessary` — isteğe bağlı hiçbir
 *   betik rıza okunmadan başlamaz.
 * - Tercih merkezi: `openConsentPreferences()` → `qx-consent-open` olayı (footer/Ayarlar linki).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  CONSENT_COOKIE,
  LEGACY_CONSENT_STORAGE_KEY,
  acceptAllConsent,
  buildConsentCookie,
  createConsent,
  effectiveConsent,
  migrateLegacyConsent,
  parseConsent,
  readConsentCookieValue,
  rejectOptionalConsent,
  serializeConsent,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentSource,
  type ConsentState,
  type EffectiveConsent,
} from './types';

export const CONSENT_CHANGE_EVENT = 'qx-consent-change';
export const CONSENT_OPEN_EVENT = 'qx-consent-open';
/** Eski banner'ın yaydığı olay — PWA kurulum afişi dinliyor; uyumluluk için yayılmaya devam eder. */
export const LEGACY_CONSENT_COMPLETE_EVENT = 'qratex-cookie-consent-complete';
const BROADCAST_CHANNEL = 'qx-consent';

const SERVER_SNAPSHOT: EffectiveConsent = effectiveConsent(null);

let cachedRaw: string | null | undefined;
let cachedSnapshot: EffectiveConsent = SERVER_SNAPSHOT;
let channel: BroadcastChannel | null | undefined;

function hasDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BROADCAST_CHANNEL) : null;
  } catch {
    channel = null;
  }
  return channel;
}

function writeCookie(state: ConsentState): void {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = buildConsentCookie(state, { secure });
}

/** Eski localStorage kaydını bir kez çereze taşır; taşınan değeri döndürür. */
function migrateFromLegacyStorage(): string | null {
  let legacyRaw: string | null = null;
  try {
    legacyRaw = window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
  const migrated = migrateLegacyConsent(legacyRaw);
  if (!migrated) return null;
  try {
    writeCookie(migrated);
  } catch {
    /* çerez yazılamıyorsa yalnız bellekte kullan */
  }
  return serializeConsent(migrated);
}

function readRaw(): string | null {
  if (!hasDom()) return null;
  let raw: string | null = null;
  try {
    raw = readConsentCookieValue(document.cookie);
  } catch {
    raw = null;
  }
  if (!raw) raw = migrateFromLegacyStorage();
  return raw;
}

/** Anlık rıza (React dışı kullanım için; ör. PostHog sağlayıcısı). */
export function getConsentSnapshot(): EffectiveConsent {
  if (!hasDom()) return SERVER_SNAPSHOT;
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = effectiveConsent(parseConsent(raw));
  return cachedSnapshot;
}

export function getServerConsentSnapshot(): EffectiveConsent {
  return SERVER_SNAPSHOT;
}

/** Rıza değişikliklerine abone olur (aynı sekme + diğer sekmeler). Abonelikten çıkış döndürür. */
export function subscribeConsent(listener: () => void): () => void {
  if (!hasDom()) return () => {};
  const onMessage = () => listener();
  window.addEventListener(CONSENT_CHANGE_EVENT, onMessage);
  const ch = getChannel();
  ch?.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onMessage);
    ch?.removeEventListener('message', onMessage);
  };
}

/** Rıza değişince `cb(consent)` çağrılır; React dışı tüketiciler için. */
export function onConsentChange(cb: (consent: EffectiveConsent) => void): () => void {
  return subscribeConsent(() => cb(getConsentSnapshot()));
}

/** Rızayı kaydeder, yayar ve yeni durumu döndürür. */
export function writeConsent(state: ConsentState): EffectiveConsent {
  if (!hasDom()) return effectiveConsent(state);
  try {
    writeCookie(state);
  } catch {
    /* gizli sekme vb. — yine de bellekte uygula */
  }
  const raw = serializeConsent(state);
  cachedRaw = raw;
  cachedSnapshot = effectiveConsent(parseConsent(raw));
  try {
    // Eski anahtar yeni karar sonrası gereksiz; banner'ın eski sürümü yanlış karar göstermesin.
    window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY);
    // Kurulum afişi, çerez kararından sonra yeniden gösterilebilsin (eski davranış).
    window.localStorage.removeItem('pwa-install-dismissed');
  } catch {
    /* yut */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: cachedSnapshot }));
  window.dispatchEvent(new CustomEvent(LEGACY_CONSENT_COMPLETE_EVENT));
  try {
    getChannel()?.postMessage(raw);
  } catch {
    /* yut */
  }
  return cachedSnapshot;
}

/** Footer / Ayarlar'daki "Çerez tercihleri" bağlantısı bunu çağırır. */
export function openConsentPreferences(): void {
  if (!hasDom()) return;
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}

/** Çerezi silmek (test ve "rızamı geri çek" için): karar verilmemiş duruma döner. */
export function clearConsent(): void {
  if (!hasDom()) return;
  try {
    document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* yut */
  }
  cachedRaw = undefined;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT));
  try {
    getChannel()?.postMessage('');
  } catch {
    /* yut */
  }
}

export interface UseConsentResult extends EffectiveConsent {
  /** İstemcide rıza okundu mu? (SSR/hidrasyon öncesi false) */
  ready: boolean;
  has: (category: ConsentCategory) => boolean;
  acceptAll: (source?: ConsentSource) => void;
  rejectOptional: (source?: ConsentSource) => void;
  save: (choices: ConsentChoices, source?: ConsentSource) => void;
  openPreferences: () => void;
}

export function useConsent(): UseConsentResult {
  const snapshot = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
  // Hidrasyon sırasında React sunucu anlık görüntüsünü kullanır → ready=false (uyumsuzluk yok).
  const ready = snapshot !== SERVER_SNAPSHOT;

  const has = useCallback((category: ConsentCategory) => snapshot.categories[category] === true, [snapshot]);
  const acceptAll = useCallback((source: ConsentSource = 'banner') => {
    writeConsent(acceptAllConsent({ source }));
  }, []);
  const rejectOptional = useCallback((source: ConsentSource = 'banner') => {
    writeConsent(rejectOptionalConsent({ source }));
  }, []);
  const save = useCallback((choices: ConsentChoices, source: ConsentSource = 'preferences') => {
    writeConsent(createConsent(choices, { source }));
  }, []);

  return useMemo(
    () => ({ ...snapshot, ready, has, acceptAll, rejectOptional, save, openPreferences: openConsentPreferences }),
    [snapshot, ready, has, acceptAll, rejectOptional, save]
  );
}
