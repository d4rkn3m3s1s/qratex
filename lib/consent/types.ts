/**
 * Çerez/izleme rızası — paylaşılan çekirdek (sunucu + istemci, saf; React/Next bağımlılığı yok).
 *
 * KVKK m.5/m.7 ve ePrivacy ilkesi: zorunlu olmayan hiçbir işleme (analitik, oturum kaydı,
 * pazarlama) AÇIK ve KATEGORİ BAZLI rıza olmadan başlamaz; varsayılan "hayır"dır. Rıza
 * sürümlüdür: politika değişince `CONSENT_VERSION` artırılır, eski rızalar geçersiz sayılır ve
 * banner yeniden sorulur (bu sırada isteğe bağlı işleme yine kapalıdır).
 *
 * Saklama: birinci taraf `qx_consent` çerezi (sunucu da okuyabilsin diye localStorage değil).
 * Biçim (çerez-güvenli, kısa): `2.a1.r0.m0.1728380000.b`
 *   sürüm . analytics . replay . marketing . karar-zamanı(epoch sn) . kaynak
 */

export const CONSENT_VERSION = 2;
export const CONSENT_COOKIE = 'qx_consent';
/** 180 gün: rıza en geç bu sürede yeniden sorulur. */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
/** Eski banner'ın localStorage anahtarı (geçiş için okunur, yazılmaz). */
export const LEGACY_CONSENT_STORAGE_KEY = 'qratex_cookie_consent_v1';

/**
 * Çerez bannerı ilk HTML'de basılır (LCP); karar verilmiş ya da kiosk ekranındaki ziyaretçide
 * bu sınıf ilk boyamadan önce <html>'e eklenir ve globals.css banner'ı gizler. Kontrol kaba
 * (çerez/eski anahtar var mı); geçersiz/süresi geçmiş karar hidrasyondan sonra banner
 * tarafından düzeltilir (sınıf kaldırılır).
 */
export const CONSENT_PREPAINT_CLASS = 'qx-consent-decided';
export const CONSENT_PREPAINT_SNIPPET = `try{var cd=/(?:^|;\\s*)${CONSENT_COOKIE}=[^;]+/.test(document.cookie);if(!cd){try{cd=!!localStorage.getItem('${LEGACY_CONSENT_STORAGE_KEY}');}catch(e){}}if(cd||location.pathname.indexOf('/wall/')===0)document.documentElement.classList.add('${CONSENT_PREPAINT_CLASS}');}catch(e){}`;

export const CONSENT_CATEGORIES = ['necessary', 'analytics', 'replay', 'marketing'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];
export type OptionalConsentCategory = Exclude<ConsentCategory, 'necessary'>;
export const OPTIONAL_CONSENT_CATEGORIES: ReadonlyArray<OptionalConsentCategory> = ['analytics', 'replay', 'marketing'];

export type ConsentSource = 'banner' | 'preferences' | 'legacy';

export interface ConsentState {
  version: number;
  /** Karar zamanı (ISO 8601). */
  decidedAt: string;
  source: ConsentSource;
  categories: Readonly<Record<ConsentCategory, boolean>>;
}

/** Ekranlarda gösterilecek Türkçe kategori metinleri (tercih merkezi + banner). */
export const CONSENT_CATEGORY_LABELS: Readonly<Record<ConsentCategory, { title: string; description: string; required: boolean }>> = {
  necessary: {
    title: 'Zorunlu',
    description: 'Oturum, güvenlik ve tercihlerinizin hatırlanması için gereklidir; kapatılamaz.',
    required: true,
  },
  analytics: {
    title: 'Analitik',
    description: 'Hangi sayfaların kullanıldığını anonim olarak ölçer; ürünü iyileştirmemize yardım eder.',
    required: false,
  },
  replay: {
    title: 'Oturum kaydı',
    description: 'Sorunları anlamak için ekrandaki etkileşimlerinizi maskelenmiş olarak kaydeder. Analitik onayı gerektirir.',
    required: false,
  },
  marketing: {
    title: 'Pazarlama',
    description: 'Kampanya etkisini ölçmek ve size uygun teklifler göstermek için kullanılır.',
    required: false,
  },
};

const SOURCE_CODES: Readonly<Record<ConsentSource, string>> = { banner: 'b', preferences: 'p', legacy: 'l' };
const CODE_SOURCES: Readonly<Record<string, ConsentSource>> = { b: 'banner', p: 'preferences', l: 'legacy' };

export type ConsentChoices = Partial<Record<OptionalConsentCategory, boolean>>;

/** Yeni rıza kaydı oluşturur. `replay`, `analytics` olmadan verilemez (bağımlı kategori). */
export function createConsent(
  choices: ConsentChoices,
  options: { now?: Date; source?: ConsentSource; version?: number } = {}
): ConsentState {
  const analytics = choices.analytics === true;
  const now = options.now ?? new Date();
  return {
    version: options.version ?? CONSENT_VERSION,
    decidedAt: new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString(),
    source: options.source ?? 'banner',
    categories: {
      necessary: true,
      analytics,
      replay: analytics && choices.replay === true,
      marketing: choices.marketing === true,
    },
  };
}

export function acceptAllConsent(options: { now?: Date; source?: ConsentSource } = {}): ConsentState {
  return createConsent({ analytics: true, replay: true, marketing: true }, options);
}

export function rejectOptionalConsent(options: { now?: Date; source?: ConsentSource } = {}): ConsentState {
  return createConsent({}, options);
}

/** Çerez değerine çevirir (çerez-güvenli karakterler: rakam, harf, nokta). */
export function serializeConsent(state: ConsentState): string {
  const c = state.categories;
  const t = Math.floor(new Date(state.decidedAt).getTime() / 1000);
  return [
    String(state.version),
    `a${c.analytics ? 1 : 0}`,
    `r${c.replay && c.analytics ? 1 : 0}`,
    `m${c.marketing ? 1 : 0}`,
    String(Number.isFinite(t) && t > 0 ? t : 0),
    SOURCE_CODES[state.source] ?? 'b',
  ].join('.');
}

/** Çerez değerini çözer; biçim bozuksa null (→ "karar verilmemiş" sayılır). */
export function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw || typeof raw !== 'string' || raw.length > 64) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  const m = /^(\d{1,4})\.a([01])\.r([01])\.m([01])\.(\d{1,12})\.([bpl])$/.exec(value);
  if (!m) return null;
  const version = Number(m[1]);
  const epoch = Number(m[5]);
  if (!Number.isInteger(version) || version < 1 || !Number.isFinite(epoch) || epoch <= 0) return null;
  const analytics = m[2] === '1';
  return {
    version,
    decidedAt: new Date(epoch * 1000).toISOString(),
    source: CODE_SOURCES[m[6] as string] ?? 'banner',
    categories: {
      necessary: true,
      analytics,
      replay: analytics && m[3] === '1',
      marketing: m[4] === '1',
    },
  };
}

/** Rıza geçerli mi? (güncel sürüm + 180 günden eski değil). */
export function isConsentCurrent(state: ConsentState | null | undefined, now: Date = new Date()): state is ConsentState {
  if (!state || state.version !== CONSENT_VERSION) return false;
  const decided = new Date(state.decidedAt).getTime();
  if (!Number.isFinite(decided)) return false;
  // Gelecekteki saat sapmasına 1 gün tolerans.
  if (decided > now.getTime() + 24 * 60 * 60 * 1000) return false;
  return now.getTime() - decided <= CONSENT_MAX_AGE_SECONDS * 1000;
}

/**
 * Kategoriye izin var mı? VARSAYILAN HAYIR: rıza yoksa, eskiyse ya da bozuksa yalnız
 * `necessary` true döner. `replay` ayrıca `analytics` gerektirir.
 */
export function hasConsent(state: ConsentState | null | undefined, category: ConsentCategory, now?: Date): boolean {
  if (category === 'necessary') return true;
  if (!isConsentCurrent(state, now)) return false;
  if (category === 'replay') return state.categories.analytics && state.categories.replay;
  return state.categories[category] === true;
}

export interface EffectiveConsent {
  /** Kullanıcı güncel sürümde karar verdi mi? false ise banner gösterilmeli. */
  decided: boolean;
  /** Ham kayıt (eski sürüm olabilir); karar yoksa null. */
  state: ConsentState | null;
  /** Uygulanacak izinler — karar yoksa yalnız `necessary`. */
  categories: Readonly<Record<ConsentCategory, boolean>>;
}

const DENY_ALL: Readonly<Record<ConsentCategory, boolean>> = Object.freeze({
  necessary: true,
  analytics: false,
  replay: false,
  marketing: false,
});

export function effectiveConsent(state: ConsentState | null | undefined, now?: Date): EffectiveConsent {
  if (!isConsentCurrent(state, now)) return { decided: false, state: state ?? null, categories: DENY_ALL };
  return {
    decided: true,
    state,
    categories: {
      necessary: true,
      analytics: hasConsent(state, 'analytics', now),
      replay: hasConsent(state, 'replay', now),
      marketing: hasConsent(state, 'marketing', now),
    },
  };
}

/**
 * Eski banner kaydını (`{accepted, optionalRejected?, date}`) yeni modele taşır.
 *  - "İsteğe bağlıları reddet" → GÜNCEL sürümde hepsi kapalı (ret anında geçerli; yeniden sorulmaz).
 *  - "Tümünü kabul et" → ESKİ sürüm (1) olarak taşınır: oturum kaydı ayrı bir kategori olarak
 *    sorulmamıştı, bu yüzden banner yeniden sorar; bu arada isteğe bağlı işleme kapalıdır.
 */
export function migrateLegacyConsent(raw: string | null | undefined, now: Date = new Date()): ConsentState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const legacy = parsed as { accepted?: unknown; optionalRejected?: unknown; date?: unknown };
  if (legacy.accepted !== true) return null;
  const legacyDate = typeof legacy.date === 'string' ? new Date(legacy.date) : null;
  const when = legacyDate && Number.isFinite(legacyDate.getTime()) ? legacyDate : now;
  if (legacy.optionalRejected === true) {
    return createConsent({}, { now: when, source: 'legacy' });
  }
  return createConsent({ analytics: true, replay: true, marketing: true }, { now: when, source: 'legacy', version: 1 });
}

/** `Set-Cookie` / `document.cookie` için tam çerez dizesi. */
export function buildConsentCookie(state: ConsentState, options: { secure?: boolean } = {}): string {
  const parts = [
    `${CONSENT_COOKIE}=${serializeConsent(state)}`,
    'Path=/',
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** `Cookie` başlığından ham rıza değerini çıkarır. */
export function readConsentCookieValue(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === CONSENT_COOKIE) return part.slice(idx + 1).trim();
  }
  return null;
}
