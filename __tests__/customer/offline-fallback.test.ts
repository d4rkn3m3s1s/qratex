/**
 * Çevrimdışı yedek sayfa (p-kart-masa-offline) — cihaz verisi, masa sinyali kuyruğu ve sayfanın
 * satır içi betiği (DOM taklidiyle; ağ yok).
 *
 *  - device-data: kart görüntüsü temizliği (yalnız diğer kullanıcılar / hepsi), oturum işaretçisi,
 *    kişisel SW önbellekleri, telemetri yolu maskesi.
 *  - signal-client: kuyruk sınırı, süre aşımı, bozuk kayıt ayıklama.
 *  - offline-document: betik sözdizimi geçerli; `<html data-qx-bare>`; bağlama göre mesaj;
 *    yalnız son oturum sahibinin kartı (adı textContent ile); bekleyen sinyal sayısı; gösterim günlüğü.
 */
import {
  OFFLINE_LOG_KEY,
  SESSION_UID_KEY,
  WALLET_SNAPSHOT_PREFIX,
  clearUserRuntimeCaches,
  purgeSnapshots,
  readOfflineLog,
  readSessionUid,
  redactPath,
  writeSessionUid,
} from '@/components/customer/p-kart-masa-offline/offline/device-data';
import {
  QUEUE_MAX,
  QUEUE_TTL_MS,
  SIGNAL_QUEUE_KEY,
  enqueueSignal,
  readQueue,
  removeQueued,
} from '@/components/customer/p-kart-masa-offline/table/signal-client';
import { buildOfflineMarkup, buildOfflineScript } from '@/components/customer/p-kart-masa-offline/offline/offline-document';

class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('device-data', () => {
  it('purgeSnapshots: keepUid dışındakiler ve eski anahtarlar silinir; diğer anahtarlar kalır', () => {
    const s = new MemStorage();
    s.setItem(`${WALLET_SNAPSHOT_PREFIX}u1`, '{}');
    s.setItem(`${WALLET_SNAPSHOT_PREFIX}u2`, '{}');
    s.setItem('qx:my-card:v1:u1', '{}');
    s.setItem('qratex-theme', 'dark');
    expect(purgeSnapshots(s, 'u1')).toBe(2);
    expect(s.getItem(`${WALLET_SNAPSHOT_PREFIX}u1`)).toBe('{}');
    expect(s.getItem('qratex-theme')).toBe('dark');
    expect(purgeSnapshots(s, null)).toBe(1);
    expect(s.length).toBe(1);
  });

  it('oturum işaretçisi: yalnız güvenli id', () => {
    const s = new MemStorage();
    writeSessionUid(s, 'u_1-x');
    expect(readSessionUid(s)).toBe('u_1-x');
    s.setItem(SESSION_UID_KEY, '<script>');
    expect(readSessionUid(s)).toBeNull();
    writeSessionUid(s, null);
    expect(s.getItem(SESSION_UID_KEY)).toBeNull();
  });

  it('kişisel SW önbellekleri silinir; destek yoksa 0', async () => {
    const deleted: string[] = [];
    const api = { delete: async (n: string) => (deleted.push(n), n === 'others') } as unknown as CacheStorage;
    expect(await clearUserRuntimeCaches(api)).toBe(1);
    expect(deleted).toContain('others');
    expect(deleted).not.toContain('next-static');
    expect(await clearUserRuntimeCaches(null)).toBe(0);
  });

  it('telemetri yolu maskelenir; günlük okunur', () => {
    expect(redactPath('/c/ABCDEFGHJKLMN?x=1')).toBe('/c/:token');
    expect(redactPath('/feedback/AB12CD34')).toBe('/feedback/:code');
    expect(redactPath('/customer/wallet')).toBe('/customer/wallet');
    const s = new MemStorage();
    s.setItem(OFFLINE_LOG_KEY, JSON.stringify([{ path: '/a', at: 1 }, { bad: true }]));
    expect(readOfflineLog(s)).toEqual([{ path: '/a', at: 1 }]);
  });
});

describe('masa sinyali kuyruğu', () => {
  const payload = { qr: 'AB12CD34', kind: 'CONCERN' as const, reasons: ['noise' as const] };
  it('sınır, süre aşımı ve silme', () => {
    const s = new MemStorage();
    const now = 1_000_000;
    for (let i = 0; i < QUEUE_MAX + 2; i++) {
      enqueueSignal(s, { nonce: `nonce-0000000000-${i}`, createdAt: now + i, payload }, now + i);
    }
    expect(readQueue(s, now + 10)).toHaveLength(QUEUE_MAX);
    expect(readQueue(s, now + QUEUE_TTL_MS + 100)).toHaveLength(0);
    const left = removeQueued(s, `nonce-0000000000-${QUEUE_MAX + 1}`, now + 10);
    expect(left).toHaveLength(QUEUE_MAX - 1);
    s.setItem(SIGNAL_QUEUE_KEY, JSON.stringify([{ nonce: 'short', createdAt: now, payload }, 'x']));
    expect(readQueue(s, now)).toHaveLength(0);
  });
});

// ── Çevrimdışı betik: en küçük DOM taklidi ──
type El = {
  id: string;
  textContent: string;
  hidden: boolean;
  disabled: boolean;
  src: string;
  alt: string;
  href: string;
  className: string;
  attrs: Record<string, string>;
  children: El[];
  listeners: Record<string, Array<(e?: unknown) => void>>;
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
  hasAttribute(k: string): boolean;
  addEventListener(t: string, fn: (e?: unknown) => void): void;
  appendChild(c: El): El;
  focus(): void;
  innerHTMLWrites: number;
};

function el(id = ''): El {
  const e: El = {
    id,
    textContent: '',
    hidden: false,
    disabled: false,
    src: '',
    alt: '',
    href: '',
    className: '',
    attrs: {},
    children: [],
    listeners: {},
    innerHTMLWrites: 0,
    setAttribute(k, v) {
      e.attrs[k] = v;
    },
    removeAttribute(k) {
      delete e.attrs[k];
    },
    hasAttribute(k) {
      return k in e.attrs;
    },
    addEventListener(t, fn) {
      (e.listeners[t] ??= []).push(fn);
    },
    appendChild(c) {
      e.children.push(c);
      return c;
    },
    focus() {},
  };
  return e;
}

function runOfflineScript(opts: { path: string; storage: MemStorage; online?: boolean }) {
  const ids = new Map<string, El>();
  const html = el('html');
  (html as unknown as { lang: string }).lang = 'tr';
  const doc = {
    documentElement: html,
    visibilityState: 'visible',
    activeElement: null,
    getElementById: (id: string) => {
      if (!ids.has(id)) ids.set(id, el(id));
      return ids.get(id)!;
    },
    createElement: () => el(),
    addEventListener: () => undefined,
  };
  const timers: Array<() => void> = [];
  const win = {
    localStorage: opts.storage,
    addEventListener: () => undefined,
    AbortController: undefined,
  };
  const fetchMock = jest.fn(() => new Promise(() => undefined)); // hiç dönmez (çevrimdışı)
  const fn = new Function(
    'document',
    'window',
    'location',
    'navigator',
    'fetch',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'caches',
    buildOfflineScript()
  );
  fn(
    doc,
    win,
    { pathname: opts.path, href: `https://x${opts.path}`, origin: 'https://x', reload: jest.fn(), replace: jest.fn() },
    { onLine: opts.online ?? false },
    fetchMock,
    (cb: () => void) => (timers.push(cb), timers.length),
    () => 0,
    () => undefined,
    () => undefined,
    undefined
  );
  return { ids, html, fetchMock };
}

describe('çevrimdışı sayfa betiği', () => {
  it('işaretleme dizgisi beklenen kimlikleri taşır; betik sözdizimi geçerli', () => {
    const markup = buildOfflineMarkup();
    for (const id of ['qx-off-title', 'qx-off-status', 'qx-off-retry', 'qx-off-card', 'qx-off-cached', 'qx-off-full']) {
      expect(markup).toContain(`id="${id}"`);
    }
    expect(markup).toContain('role="status"');
    expect(() => new Function(buildOfflineScript())).not.toThrow();
    expect(buildOfflineScript()).not.toMatch(/<\/script/i);
  });

  it('bağlam mesajı (kart), bare bayrağı, gösterim günlüğü; snapshot yoksa kart gizli', () => {
    const s = new MemStorage();
    const { ids, html } = runOfflineScript({ path: '/c/ABCDEFGHJKLMN', storage: s });
    expect(html.attrs['data-qx-bare']).toBe('offline');
    expect(ids.get('qx-off-context')!.textContent).toMatch(/Kart bağlantın/);
    expect(JSON.parse(s.getItem(OFFLINE_LOG_KEY)!)).toEqual([{ path: '/c/ABCDEFGHJKLMN', at: expect.any(Number) }]);
    expect(ids.get('qx-off-card')?.hidden ?? true).not.toBe(false);
  });

  it('son oturum sahibinin kartı gösterilir (ad textContent ile); başka kullanıcının görüntüsü okunmaz', () => {
    const s = new MemStorage();
    const now = Date.now();
    const snap = (name: string) =>
      JSON.stringify({
        v: 2,
        savedAt: now - 60_000,
        holderName: name,
        cards: [{ id: 'c1', token: 'ABCDEFGHJKLMNPQRSTUVW', status: 'ACTIVATED' }],
        qr: { ABCDEFGHJKLMNPQRSTUVW: 'data:image/png;base64,AAAA' },
      });
    s.setItem(`${WALLET_SNAPSHOT_PREFIX}u1`, snap('<img src=x onerror=alert(1)>'));
    s.setItem(`${WALLET_SNAPSHOT_PREFIX}u2`, snap('Başka Kişi'));
    s.setItem(SESSION_UID_KEY, 'u1');
    s.setItem('qratex-locale', 'en');
    s.setItem(SIGNAL_QUEUE_KEY, JSON.stringify([{ nonce: 'x'.repeat(20), createdAt: now, payload: { kind: 'OK' } }]));
    const { ids } = runOfflineScript({ path: '/customer/wallet/card', storage: s });
    expect(ids.get('qx-off-card')!.hidden).toBe(false);
    expect(ids.get('qx-off-card-holder')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(ids.get('qx-off-card-masked')!.textContent).toBe('•••• PQRS TUVW');
    expect(ids.get('qx-off-card-qr')!.src).toBe('data:image/png;base64,AAAA');
    expect(ids.get('qx-off-title')!.textContent).toBe('No internet connection');
    expect(ids.get('qx-off-pending')!.hidden).toBe(false);
    expect(ids.get('qx-off-pending')!.textContent).toMatch(/^1 table signal/);
  });

  it('data:image olmayan QR ya da bayat görüntü gösterilmez', () => {
    const s = new MemStorage();
    s.setItem(SESSION_UID_KEY, 'u1');
    s.setItem(
      `${WALLET_SNAPSHOT_PREFIX}u1`,
      JSON.stringify({ v: 2, savedAt: Date.now(), holderName: 'A', cards: [{ id: 'c', token: 'TOK123', status: 'ACTIVATED' }], qr: { TOK123: 'javascript:alert(1)' } })
    );
    const { ids } = runOfflineScript({ path: '/offline', storage: s });
    expect(ids.get('qx-off-card')?.hidden ?? true).not.toBe(false);
  });
});
