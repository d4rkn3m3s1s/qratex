/**
 * P0-36 — QR tarama kancasının saf parçaları: hata metni anahtarları ve Permissions-Policy
 * kurtarması (kamerasız bir rotadan tarama sayfasına YUMUŞAK geçişte belge kamerayı engeller).
 */
import tr from '@/messages/tr.json';
import en from '@/messages/en.json';
import { QR_SCANNER_ERROR_KEYS } from '@/lib/hooks/use-qr-scanner';
import {
  POLICY_AUTOSTART_WINDOW_MS,
  POLICY_RELOAD_COOLDOWN_MS,
  parsePolicyReloadMarker,
  readCameraPolicy,
  shouldAutostartAfterReload,
  shouldReloadForPolicy,
} from '@/lib/hooks/qr-scanner-controller';

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

describe('QR_SCANNER_ERROR_KEYS', () => {
  it.each(Object.entries(QR_SCANNER_ERROR_KEYS))('%s → %s her iki dilde dolu', (_code, key) => {
    for (const dict of [tr, en]) {
      const value = lookup(dict, key);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(10);
    }
  });

  it('Türkçe metinler Türkçe karakter taşır (ASCII’ye indirgenmemiş)', () => {
    const all = Object.values(QR_SCANNER_ERROR_KEYS)
      .map((k) => lookup(tr, k) as string)
      .join(' ');
    expect(all).toMatch(/[ığüşöçİ]/);
  });
});

describe('readCameraPolicy', () => {
  it('permissionsPolicy ya da featurePolicy API’sini okur, yoksa null', () => {
    expect(readCameraPolicy({ permissionsPolicy: { allowsFeature: () => false } })).toBe(false);
    expect(readCameraPolicy({ featurePolicy: { allowsFeature: (f: string) => f === 'camera' } })).toBe(true);
    expect(readCameraPolicy({})).toBeNull();
    expect(readCameraPolicy(null)).toBeNull();
    expect(
      readCameraPolicy({
        permissionsPolicy: {
          allowsFeature: () => {
            throw new Error('x');
          },
        },
      }),
    ).toBeNull();
  });
});

describe('policy kurtarma (tek seferlik tam yükleme)', () => {
  const path = '/dealer/scan';
  const t0 = 1_700_000_000_000;

  it('işaret yoksa ya da başka yola aitse yeniler', () => {
    expect(shouldReloadForPolicy(null, path, t0)).toBe(true);
    expect(shouldReloadForPolicy({ path: '/customer/scan', at: t0 }, path, t0)).toBe(true);
  });

  it('aynı yolda bekleme süresi içinde ikinci kez yenilemez (sonsuz döngü yok)', () => {
    expect(shouldReloadForPolicy({ path, at: t0 }, path, t0 + 1000)).toBe(false);
    expect(shouldReloadForPolicy({ path, at: t0 }, path, t0 + POLICY_RELOAD_COOLDOWN_MS)).toBe(true);
  });

  it('yenilemeden hemen sonra kamera kendiliğinden açılır; pencere dışında açılmaz', () => {
    expect(shouldAutostartAfterReload({ path, at: t0 }, path, t0 + 500)).toBe(true);
    expect(shouldAutostartAfterReload({ path, at: t0 }, path, t0 + POLICY_AUTOSTART_WINDOW_MS)).toBe(false);
    expect(shouldAutostartAfterReload({ path, at: t0 }, '/customer/scan', t0 + 500)).toBe(false);
    expect(shouldAutostartAfterReload(null, path, t0)).toBe(false);
  });

  it('bozuk işaret güvenle null olur', () => {
    expect(parsePolicyReloadMarker('{bozuk')).toBeNull();
    expect(parsePolicyReloadMarker(JSON.stringify({ path: 1, at: 'x' }))).toBeNull();
    expect(parsePolicyReloadMarker(null)).toBeNull();
    expect(parsePolicyReloadMarker(JSON.stringify({ path, at: t0 }))).toEqual({ path, at: t0 });
  });
});
