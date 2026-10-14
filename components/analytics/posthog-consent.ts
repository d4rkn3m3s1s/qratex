/**
 * PostHog ↔ rıza köprüsü — SAF karar mantığı (P0-31). React'e bağımlı değildir; sağlayıcı
 * (`posthog-provider.tsx`) yalnız bu fonksiyonları çağırır, testler de doğrudan bunları sınar.
 *
 * Kurallar:
 *  - Analitik rızası yoksa posthog-js YÜKLENMEZ (dinamik import çağrılmaz → ağ isteği 0).
 *  - Rıza reddi/geri çekilmesi: kayıt durur, opt-out, kimlik sıfırlanır, `ph_*` izleri silinir
 *    (kütüphane hiç yüklenmemiş olsa bile eski dönemden kalan çerezler temizlenir).
 *  - Oturum kaydı ayrı kategori + yol politikası (`/auth`, `/admin-gate`, `/c/…` vb. kapalı).
 *  - Olaylar gönderilmeden önce URL, kimlik ve autocapture öğe izlerindeki gizli değerler ayıklanır.
 */
import { REDACTED, isReplayAllowedPath, redactAnalyticsEvent } from '@/lib/consent';

/** Sağlayıcının kullandığı PostHog yüzeyi (test edilebilirlik için dar arayüz). */
export interface PostHogPort {
  has_opted_in_capturing(): boolean;
  opt_in_capturing(options?: { captureEventName?: string | false | null }): void;
  opt_out_capturing(): void;
  reset(): void;
  set_config(config: { disable_persistence?: boolean }): void;
  startSessionRecording(): void;
  stopSessionRecording(): void;
  sessionRecordingStarted(): boolean;
}

export interface PostHogDeps<P extends PostHogPort = PostHogPort> {
  /** NEXT_PUBLIC_POSTHOG_KEY tanımlı mı (değilse her şey etkisiz). */
  enabled: boolean;
  /** Zaten yüklenmiş örnek (yoksa null) — yükleme TETİKLEMEZ. */
  current(): P | null;
  /** Kütüphaneyi indirip başlatır. YALNIZ analitik rızası varken çağrılır. */
  load(): Promise<P | null>;
  /** `ph_*` çerez ve depolama anahtarlarını siler. */
  clearStorage(): void;
}

export interface ConsentView {
  /** İstemcide rıza okundu mu (SSR/hidrasyon öncesi false → hiçbir şey yapılmaz). */
  ready: boolean;
  analytics: boolean;
  replay: boolean;
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* PostHog iç hatası kullanıcı akışını bozmaz */
  }
}

/** Rıza geri çekildi: kaydı durdur, opt-out, kimliği sıfırla, kalıcılığı kapat, izleri sil. */
export function withdrawPostHog(ph: PostHogPort | null, clearStorage: () => void): void {
  if (ph) {
    safely(() => ph.stopSessionRecording());
    safely(() => ph.reset());
    safely(() => ph.opt_out_capturing());
    safely(() => ph.set_config({ disable_persistence: true }));
  }
  clearStorage();
}

export type AnalyticsSyncResult = 'skipped' | 'withdrawn' | 'opted_in' | 'unavailable';

/** Analitik kategorisini uygular. Rıza yoksa `load` HİÇ çağrılmaz. */
export async function syncAnalyticsConsent<P extends PostHogPort>(
  consent: ConsentView,
  deps: PostHogDeps<P>
): Promise<AnalyticsSyncResult> {
  if (!deps.enabled || !consent.ready) return 'skipped';
  if (!consent.analytics) {
    withdrawPostHog(deps.current(), deps.clearStorage);
    return 'withdrawn';
  }
  const ph = await deps.load();
  if (!ph) return 'unavailable';
  safely(() => ph.set_config({ disable_persistence: false }));
  safely(() => {
    if (!ph.has_opted_in_capturing()) ph.opt_in_capturing({ captureEventName: false });
  });
  return 'opted_in';
}

/** Bu yolda ve bu rızayla oturum kaydı çalışabilir mi? */
export function replayAllowed(consent: ConsentView, pathname: string | null | undefined): boolean {
  return consent.ready && consent.analytics && consent.replay && isReplayAllowedPath(pathname);
}

export type ReplaySyncResult = 'skipped' | 'stopped' | 'started' | 'running' | 'unavailable';

/** Oturum kaydını rızaya ve yola göre başlatır/durdurur. İzin yoksa `load` çağrılmaz. */
export async function syncReplay<P extends PostHogPort>(
  consent: ConsentView,
  pathname: string | null | undefined,
  deps: PostHogDeps<P>
): Promise<ReplaySyncResult> {
  if (!deps.enabled) return 'skipped';
  if (!replayAllowed(consent, pathname)) {
    const ph = deps.current();
    if (ph) safely(() => ph.stopSessionRecording());
    return 'stopped';
  }
  const ph = await deps.load();
  if (!ph) return 'unavailable';
  let opted = false;
  safely(() => {
    opted = ph.has_opted_in_capturing();
  });
  if (!opted) return 'unavailable';
  let result: ReplaySyncResult = 'running';
  safely(() => {
    if (!ph.sessionRecordingStarted()) {
      ph.startSessionRecording();
      result = 'started';
    }
  });
  return result;
}

// ───────────────────────────── Redaksiyon ─────────────────────────────

/** Serbest metindeki gizli sorgu parametreleri (autocapture `href`'leri, öğe zinciri). */
const INLINE_SECRET_PARAM =
  /([?&#](?:[\w.-]*(?:token|secret|password|otp|signature|auth)[\w.-]*|code|state|sig|key|apikey|api_key|session|email|phone|ref)=)[^&#"'\s;]*/gi;
/** Token taşıyan yol parçaları (`/c/<kart-token>`, `/auth/reset-password/<token>` …). */
const INLINE_SECRET_PATH = /(\/(?:c|experience|auth\/reset-password|auth\/verify(?:-email)?)\/)(?!\[token\])[^/?#"'\s;]+/gi;

/** URL alanı olmayan metinlerdeki (ör. `$elements_chain`, `attr__href`) gizli değerleri ayıklar. */
export function redactInlineSecrets(text: string): string {
  return text.replace(INLINE_SECRET_PARAM, `$1${REDACTED}`).replace(INLINE_SECRET_PATH, '$1[token]');
}

type Props = Record<string, unknown>;

function redactElements(props: Props | null | undefined): Props | null | undefined {
  if (!props) return props;
  const out: Props = { ...props };
  if (typeof out.$elements_chain === 'string') out.$elements_chain = redactInlineSecrets(out.$elements_chain);
  if (Array.isArray(out.$elements)) {
    out.$elements = out.$elements.map((el) => {
      if (!el || typeof el !== 'object') return el;
      const copy: Props = { ...(el as Props) };
      for (const k of Object.keys(copy)) {
        if ((k === 'href' || k.startsWith('attr__')) && typeof copy[k] === 'string') {
          copy[k] = redactInlineSecrets(copy[k] as string);
        }
      }
      return copy;
    });
  }
  return out;
}

type CaptureLike = { properties?: Props | null; $set?: Props | null; $set_once?: Props | null };

/**
 * PostHog `before_send`: URL alanları, gizli görünen özellikler, `$set`/`$set_once` ve
 * autocapture öğe izleri ayıklanır. Girdiyi değiştirmez.
 */
export function redactPostHogEvent<T extends CaptureLike>(event: T | null): T | null {
  const redacted = redactAnalyticsEvent(event);
  if (!redacted) return redacted;
  let out: T = redacted.properties ? { ...redacted, properties: redactElements(redacted.properties) } : redacted;
  if (out.$set_once) {
    const once = redactAnalyticsEvent({ properties: out.$set_once });
    out = { ...out, $set_once: once?.properties ?? out.$set_once };
  }
  return out;
}

/** PostHog başlatma ayarları: rıza ayrıca doğrulanana kadar hiçbir şey gönderilmez. */
/** PostHog'un ek (ağır) eklentileri; varsayılan kapalı. */
const POSTHOG_EXTRAS = process.env.NEXT_PUBLIC_POSTHOG_REPLAY === '1';

export function postHogInitConfig(apiHost: string) {
  return {
    api_host: apiHost,
    person_profiles: 'identified_only' as const, // anonim ziyaretçiyi profil sayma
    capture_pageview: false, // SPA geçişleri redakte edilerek elle gönderilir
    capture_pageleave: true,
    autocapture: true,
    // Rıza açıkça verilene kadar capture KAPALI (P0-31).
    opt_out_capturing_by_default: true,
    // Oturum kaydı ayrı kategori: yalnız açıkça başlatılır.
    disable_session_recording: true,
    // Ağır uzak eklentiler (surveys ~33 KB, dead-clicks, web-vitals) varsayılan KAPALI;
    // web vitals zaten Vercel Speed Insights'ta. Geri açmak: NEXT_PUBLIC_POSTHOG_REPLAY=1.
    disable_surveys: !POSTHOG_EXTRAS,
    capture_dead_clicks: POSTHOG_EXTRAS,
    capture_performance: POSTHOG_EXTRAS ? undefined : false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask], [data-private]',
      blockSelector: '[data-ph-block]',
    },
  };
}

/** PostHog'un tarayıcıda bıraktığı çerez ve depolama anahtarlarını siler. */
export function clearPostHogStorage(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  try {
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim();
      if (!name || !/^(ph_|__ph_)/.test(name)) continue;
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      const root = location.hostname.split('.').slice(-2).join('.');
      document.cookie = `${name}=; Path=/; Domain=.${root}; Max-Age=0; SameSite=Lax`;
    }
  } catch {
    /* yut */
  }
  for (const store of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const s = store();
      const keys: string[] = [];
      for (let i = 0; i < s.length; i += 1) {
        const k = s.key(i);
        if (k && /^(ph_|__ph_)/.test(k)) keys.push(k);
      }
      keys.forEach((k) => s.removeItem(k));
    } catch {
      /* depolama kapalı */
    }
  }
}
