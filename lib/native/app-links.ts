/**
 * Deep link doğrulama dosyaları (Android App Links + iOS Universal Links).
 * Kimlikler env'den gelir; boşsa dosyalar geçerli ama BOŞ döner (sahte parmak izi yok)
 * — bkz. docs/native/README.md.
 *   ANDROID_SHA256_CERT_FINGERPRINTS : virgülle ayrılmış SHA-256 imza parmak izleri (AA:BB:...)
 *   APPLE_TEAM_IDENTIFIER            : Apple Developer Team ID (wallet ile ortak)
 */
export const NATIVE_APP_ID = 'com.qratex.app';

/** Uygulamada açılmaması gereken yollar (API, yönetim kapısı). */
const EXCLUDED_PATHS = ['/api/*', '/admin-gate*', '/.well-known/*'];

export function androidFingerprints(raw = process.env.ANDROID_SHA256_CERT_FINGERPRINTS): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
}

export function buildAssetLinks(raw?: string) {
  const fps = androidFingerprints(raw);
  if (fps.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: NATIVE_APP_ID, sha256_cert_fingerprints: fps },
    },
  ];
}

export function buildAppleAppSiteAssociation(teamIdRaw = process.env.APPLE_TEAM_IDENTIFIER) {
  const teamId = (teamIdRaw ?? '').trim();
  if (!/^[A-Z0-9]{10}$/.test(teamId)) return { applinks: { details: [] } };
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${NATIVE_APP_ID}`],
          components: [
            ...EXCLUDED_PATHS.map((p) => ({ '/': p, exclude: true })),
            { '/': '/*' },
          ],
        },
      ],
    },
  };
}
