/**
 * "Görüldü" bayrakları (onboarding sheet, karşılama videosu) — localStorage cihaz başınadır;
 * sunucuda da tutulur ki kullanıcı yeni cihazda / native uygulamada aynı karşılamayı tekrar görmesin.
 *
 * Saklama (şema değişmeden): `Settings.user_settings_<userId>` değerinin üst düzey `uiSeen`
 * anahtarı → { onboarding?: ISO, welcomeVideo?: ISO }. lib/customer-settings bilinmeyen üst düzey
 * anahtarları korur; anonimleştirmede satır komple silinir (lib/gdpr-core).
 */
export const UI_SEEN_FLAGS = ['onboarding', 'welcomeVideo'] as const;
export type UiSeenFlag = (typeof UI_SEEN_FLAGS)[number];
export type UiSeenMap = Partial<Record<UiSeenFlag, string>>;

export function readUiSeen(raw: unknown): UiSeenMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const seen = (raw as Record<string, unknown>).uiSeen;
  if (typeof seen !== 'object' || seen === null || Array.isArray(seen)) return {};
  const out: UiSeenMap = {};
  for (const flag of UI_SEEN_FLAGS) {
    const v = (seen as Record<string, unknown>)[flag];
    if (typeof v === 'string' && v) out[flag] = v;
  }
  return out;
}

const ENDPOINT = '/api/user/ui-seen';

/** İstemci: sunucudaki bayrağı oku (hata/ağ yoksa null → yalnız localStorage'a güvenilir). */
export async function fetchUiSeen(): Promise<UiSeenMap | null> {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { seen?: UiSeenMap } };
    return json.data?.seen ?? null;
  } catch {
    return null;
  }
}

/** İstemci: bayrağı sunucuya yaz (en iyi çaba; başarısızsa localStorage zaten yazılmıştır). */
export function markUiSeen(flag: UiSeenFlag): void {
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* yoksay */
  }
}
