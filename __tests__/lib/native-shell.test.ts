import { decideBackAction, hasOpenLayer, isExternalHttpUrl } from '@/lib/native/back-button';
import { androidFingerprints, buildAppleAppSiteAssociation, buildAssetLinks } from '@/lib/native/app-links';
import { readUiSeen } from '@/lib/ui-seen';

const FP = Array.from({ length: 32 }, () => 'AB').join(':');

describe('native geri tuşu', () => {
  it('açık katman varsa önce katmanı kapatır', () => {
    expect(decideBackAction({ hasOpenLayer: true, canGoBack: true, pathname: '/customer/wallet' })).toBe('close-layer');
  });
  it('alt sayfada geçmişe döner, kökte çıkış onayı', () => {
    expect(decideBackAction({ hasOpenLayer: false, canGoBack: true, pathname: '/customer/wallet' })).toBe('history-back');
    expect(decideBackAction({ hasOpenLayer: false, canGoBack: true, pathname: '/customer/' })).toBe('confirm-exit');
    expect(decideBackAction({ hasOpenLayer: false, canGoBack: false, pathname: '/dealer/inbox' })).toBe('confirm-exit');
  });
  it('Radix açık dialogunu algılar', () => {
    const fakeDoc = (match: boolean) =>
      ({ querySelector: (sel: string) => (match && sel.includes('[role="dialog"][data-state="open"]') ? {} : null) }) as unknown as Document;
    expect(hasOpenLayer(fakeDoc(false))).toBe(false);
    expect(hasOpenLayer(fakeDoc(true))).toBe(true);
  });
  it('harici bağlantıyı ayırt eder', () => {
    expect(isExternalHttpUrl('https://maps.google.com/x', 'qratex.com')).toBe(true);
    expect(isExternalHttpUrl('/customer', 'qratex.com')).toBe(false);
    expect(isExternalHttpUrl('mailto:a@b.c', 'qratex.com')).toBe(false);
  });
});

describe('deep link doğrulama dosyaları', () => {
  it('parmak izi yoksa boş, geçersizleri ayıklar', () => {
    expect(buildAssetLinks('')).toEqual([]);
    expect(androidFingerprints(`yanlis, ${FP.toLowerCase()}`)).toEqual([FP]);
    expect(buildAssetLinks(FP)[0].target.package_name).toBe('com.qratex.app');
  });
  it('Team ID yoksa boş applinks, varsa appID üretir', () => {
    expect(buildAppleAppSiteAssociation('')).toEqual({ applinks: { details: [] } });
    const aasa = buildAppleAppSiteAssociation('ABCDE12345');
    expect(aasa.applinks.details[0].appIDs).toEqual(['ABCDE12345.com.qratex.app']);
  });
});

describe('uiSeen okuma', () => {
  it('yalnız bilinen bayrakları ve dizeleri alır', () => {
    expect(readUiSeen(null)).toEqual({});
    expect(readUiSeen({ uiSeen: { onboarding: '2026-10-11T00:00:00Z', welcomeVideo: 5, x: 'y' } })).toEqual({
      onboarding: '2026-10-11T00:00:00Z',
    });
  });
});
