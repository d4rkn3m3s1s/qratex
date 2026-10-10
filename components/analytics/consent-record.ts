'use client';

/**
 * Rıza kararını sunucuya kanıt olarak yazar (`ConsentRecord`, P0-31) ve hesaba bağlı son
 * kararı okur (cihazlar arası senkron). Ağ hatası kullanıcının kararını ENGELLEMEZ: tarayıcı
 * çerezi asıl uygulanan karardır, kayıt en iyi çabayla gönderilir.
 */
import {
  CONSENT_VERSION,
  createConsent,
  type ConsentChoices,
  type ConsentSource,
  type ConsentState,
} from '@/lib/consent';
import { writeConsent } from '@/lib/consent/client';

export type ConsentSurface = 'banner' | 'settings' | 'footer' | 'policy' | 'other';

const ANON_KEY = 'qx_consent_anon';

function randomId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Oturumsuz ziyaretçinin rıza kaydı için rastgele, kişiye bağlanamayan kimlik. */
function anonId(): string | undefined {
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(ANON_KEY, id);
    }
    return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export function recordConsentDecision(state: ConsentState, surface: ConsentSurface): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    version: state.version,
    analytics: state.categories.analytics,
    replay: state.categories.replay,
    marketing: state.categories.marketing,
    surface,
    anonId: anonId(),
  });
  try {
    void fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      /* kanıt en iyi çaba */
    });
  } catch {
    /* yut */
  }
}

/** Kararı tarayıcıya uygular + kanıtı gönderir. Pazarlama kategorisi kullanılmadığı için hep kapalı. */
export function applyConsentDecision(
  choices: Pick<ConsentChoices, 'analytics' | 'replay'>,
  surface: ConsentSurface
): ConsentState {
  const source: ConsentSource = surface === 'banner' ? 'banner' : 'preferences';
  const state = createConsent({ analytics: choices.analytics === true, replay: choices.replay === true, marketing: false }, { source });
  writeConsent(state);
  recordConsentDecision(state, surface);
  return state;
}

const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Oturum açmış kullanıcının bu cihazda kararı yoksa, hesabındaki son GÜNCEL sürüm kararını
 * uygular (yeniden kanıt yazmaz). Uygulandıysa true.
 */
export async function adoptAccountConsent(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/consent', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!res.ok) return false;
    const json = (await res.json()) as {
      data?: { record?: { version: string; analytics: boolean; replay: boolean; createdAt: string } | null };
    };
    const record = json.data?.record;
    if (!record || Number(record.version) !== CONSENT_VERSION) return false;
    const decided = new Date(record.createdAt);
    if (!Number.isFinite(decided.getTime()) || Date.now() - decided.getTime() > MAX_AGE_MS) return false;
    writeConsent(
      createConsent({ analytics: record.analytics, replay: record.replay, marketing: false }, { source: 'preferences', now: decided })
    );
    return true;
  } catch {
    return false;
  }
}
