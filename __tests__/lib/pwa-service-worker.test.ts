/**
 * P0-37 — SW kaydı: QR hunisinde yok, tek SW (push dahil), eşzamanlı kayıt tek istek.
 */
import {
  __resetServiceWorkerRegistrationForTests,
  ensureServiceWorkerRegistration,
  getServiceWorkerScriptUrl,
  shouldRegisterServiceWorker,
} from '@/lib/pwa/service-worker';

describe('shouldRegisterServiceWorker', () => {
  it.each(['/feedback/AB12CD34', '/feedback', '/c/tokentoken', '/surveys/abc', '/table-signal/x', '/auth/login', '/admin', '/admin/users', '/admin-gate'])(
    'QR hunisi / auth / yönetim: %s → kayıt yok',
    (p) => {
      expect(shouldRegisterServiceWorker(p)).toBe(false);
    },
  );

  it.each(['/customer', '/customer/scan', '/dealer', '/dealer/scan', '/campaigns', '/cards'])('panel: %s → kayıt', (p) => {
    expect(shouldRegisterServiceWorker(p)).toBe(true);
  });

  it('boş yol → kayıt yok', () => {
    expect(shouldRegisterServiceWorker(null)).toBe(false);
  });
});

describe('getServiceWorkerScriptUrl', () => {
  it('üretimde push dinleyicisini içeren tek SW, geliştirmede bağımsız push SW', () => {
    expect(getServiceWorkerScriptUrl('production')).toBe('/sw.js');
    expect(getServiceWorkerScriptUrl('development')).toBe('/push-sw.js');
    expect(getServiceWorkerScriptUrl('test')).toBe('/push-sw.js');
  });
});

describe('ensureServiceWorkerRegistration', () => {
  const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
  const originalWindow = g.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    __resetServiceWorkerRegistrationForTests();
    g.window = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  });

  function installNavigator(register: jest.Mock) {
    g.window = {};
    Object.defineProperty(globalThis, 'navigator', {
      value: { serviceWorker: { register } },
      configurable: true,
      writable: true,
    });
  }

  it('eşzamanlı çağrılar tek register isteği yapar, kapsam "/"', async () => {
    const reg = { scope: '/' };
    const register = jest.fn().mockResolvedValue(reg);
    installNavigator(register);
    const [a, b] = await Promise.all([ensureServiceWorkerRegistration(), ensureServiceWorkerRegistration()]);
    expect(a).toBe(reg);
    expect(b).toBe(reg);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/push-sw.js', { scope: '/' }); // jest NODE_ENV=test
  });

  it('kayıt hatasından sonra yeniden denenebilir', async () => {
    const register = jest.fn().mockRejectedValueOnce(new Error('ağ')).mockResolvedValueOnce({ scope: '/' });
    installNavigator(register);
    await expect(ensureServiceWorkerRegistration()).rejects.toThrow('ağ');
    await expect(ensureServiceWorkerRegistration()).resolves.toEqual({ scope: '/' });
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('desteklenmeyen ortamda null', async () => {
    g.window = undefined;
    await expect(ensureServiceWorkerRegistration()).resolves.toBeNull();
  });
});
