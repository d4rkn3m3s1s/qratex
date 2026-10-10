/**
 * P0-31 — PostHog GERÇEKTEN rızaya bağlı.
 *
 * Hata senaryosu (denetim): "İsteğe bağlıları reddet" localStorage'a yazılıyor ama hiç
 * okunmuyordu; PostHog autocapture + oturum kaydı rızasız çalışıyor, şifre sıfırlama /
 * magic link `token`'ı `$current_url` ile üçüncü tarafa gidiyordu.
 * Kabul ölçütü: çerez reddinde PostHog ağ isteği 0 (kütüphane hiç yüklenmez).
 */
import {
  postHogInitConfig,
  redactInlineSecrets,
  redactPostHogEvent,
  replayAllowed,
  syncAnalyticsConsent,
  syncReplay,
  withdrawPostHog,
  type PostHogDeps,
  type PostHogPort,
} from '@/components/analytics/posthog-consent';

function fakePostHog(opted = false) {
  let optedIn = opted;
  let recording = false;
  const ph = {
    has_opted_in_capturing: jest.fn(() => optedIn),
    opt_in_capturing: jest.fn(() => {
      optedIn = true;
    }),
    opt_out_capturing: jest.fn(() => {
      optedIn = false;
    }),
    reset: jest.fn(),
    set_config: jest.fn(),
    startSessionRecording: jest.fn(() => {
      recording = true;
    }),
    stopSessionRecording: jest.fn(() => {
      recording = false;
    }),
    sessionRecordingStarted: jest.fn(() => recording),
  } satisfies PostHogPort;
  return ph;
}

function deps(instance: PostHogPort | null, loaded: PostHogPort | null = instance) {
  let current = instance;
  const d = {
    enabled: true,
    current: jest.fn(() => current),
    load: jest.fn(async () => {
      current = loaded;
      return loaded;
    }),
    clearStorage: jest.fn(),
  } satisfies PostHogDeps;
  return d;
}

const REJECTED = { ready: true, analytics: false, replay: false };
const ANALYTICS_ONLY = { ready: true, analytics: true, replay: false };
const ALL = { ready: true, analytics: true, replay: true };

describe('analitik rızası', () => {
  it('KABUL ÖLÇÜTÜ: reddedildiyse kütüphane YÜKLENMEZ (ağ isteği 0) ve eski ph_* izleri silinir', async () => {
    const d = deps(null, fakePostHog());
    await expect(syncAnalyticsConsent(REJECTED, d)).resolves.toBe('withdrawn');
    expect(d.load).not.toHaveBeenCalled();
    expect(d.clearStorage).toHaveBeenCalledTimes(1);
  });

  it('rıza henüz okunmadıysa (SSR/hidrasyon) hiçbir şey yapılmaz', async () => {
    const d = deps(null, fakePostHog());
    await expect(syncAnalyticsConsent({ ready: false, analytics: true, replay: true }, d)).resolves.toBe('skipped');
    expect(d.load).not.toHaveBeenCalled();
  });

  it('anahtar tanımlı değilse tamamen etkisiz (fail-safe)', async () => {
    const d = { ...deps(null, fakePostHog()), enabled: false };
    await expect(syncAnalyticsConsent(ALL, d)).resolves.toBe('skipped');
    expect(d.load).not.toHaveBeenCalled();
  });

  it('kabul → yüklenir ve AÇIKÇA opt-in yapılır', async () => {
    const ph = fakePostHog(false);
    const d = deps(null, ph);
    await expect(syncAnalyticsConsent(ANALYTICS_ONLY, d)).resolves.toBe('opted_in');
    expect(d.load).toHaveBeenCalledTimes(1);
    expect(ph.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    expect(ph.set_config).toHaveBeenCalledWith({ disable_persistence: false });
  });

  it('rıza geri çekilince: kayıt durur, opt-out, kimlik sıfırlanır, kalıcılık kapanır, izler silinir', async () => {
    const ph = fakePostHog(true);
    const d = deps(ph);
    await syncAnalyticsConsent(REJECTED, d);
    expect(ph.stopSessionRecording).toHaveBeenCalled();
    expect(ph.reset).toHaveBeenCalled();
    expect(ph.opt_out_capturing).toHaveBeenCalled();
    expect(ph.set_config).toHaveBeenCalledWith({ disable_persistence: true });
    expect(d.clearStorage).toHaveBeenCalled();
    expect(ph.has_opted_in_capturing()).toBe(false);
  });

  it('PostHog iç hatası geri çekmeyi yarıda bırakmaz', () => {
    const ph = fakePostHog(true);
    ph.reset.mockImplementation(() => {
      throw new Error('boom');
    });
    const clear = jest.fn();
    withdrawPostHog(ph, clear);
    expect(ph.opt_out_capturing).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });

  it('başlatma ayarı: rıza doğrulanana kadar capture ve oturum kaydı KAPALI', () => {
    const cfg = postHogInitConfig('https://eu.i.posthog.com');
    expect(cfg.opt_out_capturing_by_default).toBe(true);
    expect(cfg.disable_session_recording).toBe(true);
    expect(cfg.capture_pageview).toBe(false);
    expect(cfg.session_recording.maskAllInputs).toBe(true);
  });
});

describe('oturum kaydı (replay) ayrı kategori + yol politikası', () => {
  it('yalnız analitik rızasıyla oturum kaydı BAŞLAMAZ (yükleme de tetiklenmez)', async () => {
    const d = deps(null, fakePostHog(true));
    await expect(syncReplay(ANALYTICS_ONLY, '/customer', d)).resolves.toBe('stopped');
    expect(d.load).not.toHaveBeenCalled();
  });

  it.each(['/auth/reset-password', '/auth/magic', '/auth/login', '/admin-gate', '/c/abc123', '/experience/tok'])(
    'giriş/token yolunda (%s) kayıt kapalı; çalışan kayıt durdurulur',
    async (path) => {
      const ph = fakePostHog(true);
      ph.startSessionRecording();
      const d = deps(ph);
      await expect(syncReplay(ALL, path, d)).resolves.toBe('stopped');
      expect(ph.stopSessionRecording).toHaveBeenCalled();
      expect(replayAllowed(ALL, path)).toBe(false);
    }
  );

  it('izinli yolda ve iki rıza varken başlar; ikinci çağrı yeniden başlatmaz', async () => {
    const ph = fakePostHog(true);
    const d = deps(null, ph);
    await expect(syncReplay(ALL, '/customer/rewards', d)).resolves.toBe('started');
    await expect(syncReplay(ALL, '/customer/rewards', d)).resolves.toBe('running');
    expect(ph.startSessionRecording).toHaveBeenCalledTimes(1);
  });

  it('opt-in olmamış örnekte kayıt başlamaz', async () => {
    const ph = fakePostHog(false);
    await expect(syncReplay(ALL, '/customer', deps(null, ph))).resolves.toBe('unavailable');
    expect(ph.startSessionRecording).not.toHaveBeenCalled();
  });
});

describe('before_send redaksiyonu', () => {
  it('HATA SENARYOSU: sıfırlama token\'ı $current_url ile gitmez', () => {
    const out = redactPostHogEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://qratex.com/auth/reset-password?token=SECRET123&lang=tr',
        $referrer: 'https://mail.example/?code=OAUTHCODE',
        $pathname: '/c/CARDTOKEN99',
      },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('SECRET123');
    expect(text).not.toContain('OAUTHCODE');
    expect(text).not.toContain('CARDTOKEN99');
    expect(out!.properties!.$current_url).toBe('https://qratex.com/auth/reset-password?token=[gizli]&lang=tr');
  });

  it('autocapture öğe zinciri ve href öznitelikleri de ayıklanır', () => {
    const out = redactPostHogEvent({
      event: '$autocapture',
      properties: {
        $elements_chain: 'a:href="/auth/magic?token=MAGIC1&next=%2F"nth-child="1"',
        $elements: [{ tag_name: 'a', attr__href: '/c/KARTTOKEN?ref=XYZ' }],
      },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('MAGIC1');
    expect(text).not.toContain('KARTTOKEN');
    expect(text).not.toContain('XYZ');
  });

  it('$set_once ilk URL alanları da ayıklanır; girdi nesnesi değişmez', () => {
    const input = { event: 'x', properties: {}, $set_once: { $initial_current_url: 'https://q.test/auth/magic?token=T0' } };
    const out = redactPostHogEvent(input);
    expect(JSON.stringify(out)).not.toContain('T0');
    expect(input.$set_once.$initial_current_url).toContain('T0');
  });

  it('gizli olmayan metin aynen kalır', () => {
    expect(redactInlineSecrets('/customer/rewards?tab=active')).toBe('/customer/rewards?tab=active');
  });
});

describe('lib/analytics track/identify: rıza yoksa posthog-js HİÇ yüklenmez', () => {
  const mockLoaded = jest.fn();
  const mockCapture = jest.fn();
  let cookie = '';

  beforeAll(() => {
    jest.doMock('posthog-js', () => {
      mockLoaded();
      return { __esModule: true, default: { __loaded: true, has_opted_in_capturing: () => true, capture: mockCapture, identify: jest.fn() } };
    });
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    };
    (globalThis as Record<string, unknown>).document = {
      get cookie() {
        return cookie;
      },
      set cookie(_v: string) {
        /* yok say */
      },
    };
  });

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    jest.dontMock('posthog-js');
  });

  beforeEach(() => {
    jest.resetModules();
    mockLoaded.mockClear();
    mockCapture.mockClear();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('KABUL ÖLÇÜTÜ: karar yok / reddedildi → modül import edilmez, olay gitmez', async () => {
    cookie = '';
    const { track, identify } = await import('@/lib/analytics');
    track('signup_started');
    identify('u1');
    cookie = `qx_consent=2.a0.r0.m0.${Math.floor(Date.now() / 1000)}.b`;
    jest.resetModules();
    const again = await import('@/lib/analytics');
    again.track('signup_started');
    await flush();
    expect(mockLoaded).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('analitik kabul edildiyse olay gider', async () => {
    cookie = `qx_consent=2.a1.r0.m0.${Math.floor(Date.now() / 1000)}.b`;
    const { track } = await import('@/lib/analytics');
    track('signup_started', { step: 1 });
    await flush();
    await flush();
    expect(mockCapture).toHaveBeenCalledWith('signup_started', { step: 1 });
  });

  it('eski sürüm rıza (politika değişti) yeniden sorulana kadar geçersiz', async () => {
    cookie = `qx_consent=1.a1.r1.m1.${Math.floor(Date.now() / 1000)}.b`;
    const { track } = await import('@/lib/analytics');
    track('x');
    await flush();
    expect(mockLoaded).not.toHaveBeenCalled();
  });
});
