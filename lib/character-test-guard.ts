/**
 * Karakter rozeti test aracının üretim kapısı + hedef allowlist'i (P0-23).
 *
 * Önceki durum: `/api/admin/character-test` "yalnız geliştirme/demo içindir" diyordu ama ne
 * ortam bayrağı ne hedef kısıtı vardı. Admin herhangi bir gerçek müşteride "Sıfırla → Barı
 * doldur → reveal" döngüsüyle aynı karakter rozetinin ödül puanını (2.500–10.000) tekrar tekrar
 * bastırabiliyor, gerçek yorumların kategorilerini kalıcı olarak bozabiliyordu. Yerel
 * `DATABASE_URL` canlı Neon'u gösterdiği için "geliştirme ortamı" da güvenli değil.
 *
 * Kurallar:
 *  - VERİ DEĞİŞTİREN aksiyonlar (reset, fill, clearCategories, cleanupTest) üretimde KAPALI;
 *    yalnız `CHARACTER_TEST_ENABLED=true` ile açılır.
 *  - Açık olsa bile hedef HER ORTAMDA allowlist'te olmalı: `User.isDemo = true` ya da e-postası
 *    `CHARACTER_TEST_ALLOWLIST` (virgülle ayrılmış) içinde, rolü CUSTOMER.
 *  - Salt-okunur aksiyonlar (durum, revealPreview, classify) her zaman açıktır.
 */
import { normalizeEmail } from '@/lib/auth/normalize-email';

export const CHARACTER_TEST_MUTATING_ACTIONS = ['reset', 'fill', 'clearCategories', 'cleanupTest'] as const;
export type CharacterTestMutatingAction = (typeof CHARACTER_TEST_MUTATING_ACTIONS)[number];

export function isMutatingCharacterTestAction(action: string): action is CharacterTestMutatingAction {
  return (CHARACTER_TEST_MUTATING_ACTIONS as readonly string[]).includes(action);
}

type Env = Record<string, string | undefined>;

/** Veri değiştiren test araçları bu ortamda açık mı? */
export function characterTestMutationsEnabled(env: Env = process.env): boolean {
  if (env.CHARACTER_TEST_ENABLED === 'true') return true;
  if (env.CHARACTER_TEST_ENABLED === 'false') return false;
  return env.NODE_ENV !== 'production';
}

export function characterTestAllowlist(env: Env = process.env): Set<string> {
  return new Set(
    String(env.CHARACTER_TEST_ALLOWLIST ?? '')
      .split(',')
      .map((e) => normalizeEmail(e))
      .filter(Boolean)
  );
}

export type TestTarget = { id: string; email: string | null; role: string; isDemo?: boolean | null };

/** Hedef test hesabı mı? (demo hesap ya da allowlist'teki müşteri) */
export function isAllowedCharacterTestTarget(target: TestTarget, env: Env = process.env): boolean {
  if (target.role !== 'CUSTOMER') return false;
  if (target.isDemo === true) return true;
  const email = normalizeEmail(target.email ?? '');
  return email !== '' && characterTestAllowlist(env).has(email);
}

export type CharacterTestGate =
  | { ok: true }
  | { ok: false; status: 403; code: 'CHARACTER_TEST_DISABLED' | 'TARGET_NOT_ALLOWED'; error: string };

export function gateCharacterTestMutation(target: TestTarget, env: Env = process.env): CharacterTestGate {
  if (!characterTestMutationsEnabled(env)) {
    return {
      ok: false,
      status: 403,
      code: 'CHARACTER_TEST_DISABLED',
      error:
        'Karakter test araçları üretim ortamında kapalı. Önizleme ve sınıflandırma kullanılabilir; veri değiştiren araçlar için CHARACTER_TEST_ENABLED gerekir.',
    };
  }
  if (!isAllowedCharacterTestTarget(target, env)) {
    return {
      ok: false,
      status: 403,
      code: 'TARGET_NOT_ALLOWED',
      error:
        'Bu araç yalnız test hesaplarında çalışır (demo müşteri ya da CHARACTER_TEST_ALLOWLIST içindeki müşteri). Gerçek müşterilerin verisi değiştirilemez.',
    };
  }
  return { ok: true };
}
