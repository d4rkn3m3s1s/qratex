/**
 * R2 sunum yardımcıları (lib/storage/served-url.ts) — bucket kapatılabilsin diye her dosya
 * uygulama uçlarından sunulur; DB'deki eski r2.dev URL'leri de doğru uca yönlenir.
 */
import {
  isSafeKey,
  publicFileUrl,
  safeFileHeaders,
  servedFeedbackMedia,
  servePublicRef,
  storedKeyOf,
  toServedUrl,
} from '@/lib/storage/served-url';
import { isAcceptedProductImage } from '@/lib/dealer/catalog/core';

const BASE = 'https://pub-abc.r2.dev';
const ORIGINAL = process.env.R2_PUBLIC_URL;

beforeEach(() => {
  process.env.R2_PUBLIC_URL = BASE;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.R2_PUBLIC_URL;
  else process.env.R2_PUBLIC_URL = ORIGINAL;
});

describe('isSafeKey', () => {
  it('göreli, temiz key kabul; traversal/mutlak/boş segment/ters bölü/yüzde red', () => {
    expect(isSafeKey('assets/badges/a-1.png')).toBe(true);
    for (const bad of ['../x', 'assets/../tasks/a.pdf', '/assets/a.png', 'assets//a.png', 'assets/./a.png', 'assets\\a.png', 'assets/%2e%2e/a.png', '', 'assets/a b.png']) {
      expect(isSafeKey(bad)).toBe(false);
    }
  });
});

describe('storedKeyOf (geri uyum ayrıştırması)', () => {
  it('eski public URL, iç public URL, /key, çıplak key → key', () => {
    expect(storedKeyOf(`${BASE}/logos/d1/x.jpg`)).toBe('logos/d1/x.jpg');
    expect(storedKeyOf('/api/files/public/assets/badges/a.png')).toBe('assets/badges/a.png');
    expect(storedKeyOf('/tasks/u/a.pdf')).toBe('tasks/u/a.pdf');
    expect(storedKeyOf('feedback/qr/2026-10/abc.jpg')).toBe('feedback/qr/2026-10/abc.jpg');
  });
  it('tanınmayan / tehlikeli biçimler → null', () => {
    expect(storedKeyOf('https://evil.test/assets/a.png')).toBeNull();
    expect(storedKeyOf('/images/uploads/tasks/a.pdf')).toBeNull();
    expect(storedKeyOf('🏆')).toBeNull();
    expect(storedKeyOf('random/a.png')).toBeNull();
    expect(storedKeyOf(`${BASE}/assets/../tasks/a.pdf`)).toBeNull();
    expect(storedKeyOf('/api/files/public/assets/%2e%2e/tasks/a.pdf')).toBeNull();
    expect(storedKeyOf('//evil.test/assets/a.png')).toBeNull();
    expect(storedKeyOf(null)).toBeNull();
  });
});

describe('toServedUrl', () => {
  it('public sınıf → /api/files/public; private key public bağlamda SIZMAZ', () => {
    expect(toServedUrl(`${BASE}/assets/rewards/a.png`, { kind: 'public' })).toBe('/api/files/public/assets/rewards/a.png');
    expect(toServedUrl('tasks/u/a.pdf', { kind: 'public' })).toBeNull();
    expect(toServedUrl(`${BASE}/inbox/1-a.pdf`, { kind: 'public' })).toBeNull();
  });
  it('görev / geri bildirim / gelen kutusu yetkili uçları', () => {
    expect(toServedUrl(`${BASE}/tasks/u/a.pdf`, { kind: 'task', taskId: 't1' })).toBe('/api/admin/team/tasks/t1/file?k=tasks%2Fu%2Fa.pdf');
    expect(toServedUrl('tasks/u/a.pdf', { kind: 'task', taskId: 't1' })).toBe('/api/admin/team/tasks/t1/file?k=tasks%2Fu%2Fa.pdf');
    expect(toServedUrl('feedback/q/2026-10/a.jpg', { kind: 'feedback', feedbackId: 'f1', index: 2 })).toBe('/api/files/feedback/f1/2');
    expect(toServedUrl('inbox/1-a.pdf', { kind: 'inbox', messageId: 'm1', index: 0 })).toBe('/api/admin/inbox/m1/attachments/0');
    // Sınıf uyuşmazlığı
    expect(toServedUrl('feedback/q/2026-10/a.jpg', { kind: 'task', taskId: 't1' })).toBeNull();
  });
  it('R2 dışı değerler aynen; boş → null', () => {
    expect(toServedUrl('/images/uploads/tasks/a.pdf', { kind: 'task', taskId: 't' })).toBe('/images/uploads/tasks/a.pdf');
    expect(toServedUrl('https://images.unsplash.com/x', { kind: 'public' })).toBe('https://images.unsplash.com/x');
    expect(toServedUrl('', { kind: 'public' })).toBeNull();
    expect(toServedUrl(null, { kind: 'public' })).toBeNull();
  });
});

describe('servePublicRef (Prisma okuma dönüşümü)', () => {
  it('yalnız eski r2.dev public URL değişir', () => {
    expect(servePublicRef(`${BASE}/logos/d1/x.jpg`)).toBe('/api/files/public/logos/d1/x.jpg');
    expect(servePublicRef('🏆')).toBe('🏆');
    expect(servePublicRef('/images/badges/a.svg')).toBe('/images/badges/a.svg');
    expect(servePublicRef('/api/files/public/assets/a/b.png')).toBe('/api/files/public/assets/a/b.png');
    expect(servePublicRef(null)).toBeNull();
    // Public alanda duran özel key'li eski URL public uca ÇEVRİLMEZ.
    expect(servePublicRef(`${BASE}/tasks/u/a.pdf`)).toBe(`${BASE}/tasks/u/a.pdf`);
  });
  it('R2_PUBLIC_URL yoksa dokunmaz', () => {
    delete process.env.R2_PUBLIC_URL;
    expect(servePublicRef('https://pub-abc.r2.dev/logos/d1/x.jpg')).toBe('https://pub-abc.r2.dev/logos/d1/x.jpg');
  });
});

describe('servedFeedbackMedia', () => {
  it('ham dizideki index korunur; eski URL ve key ikisi de yetkili uca; data: aynen', () => {
    const raw = [`${BASE}/feedback/q/2026-10/a.jpg`, 'data:image/png;base64,xx', 'feedback/q/2026-10/b.jpg', { url: 'feedback/q/2026-10/c.jpg' }, `${BASE}/tasks/x.pdf`, 42];
    expect(servedFeedbackMedia('f1', raw)).toEqual([
      '/api/files/feedback/f1/0',
      'data:image/png;base64,xx',
      '/api/files/feedback/f1/2',
      '/api/files/feedback/f1/3',
    ]);
    expect(servedFeedbackMedia('f1', null)).toEqual([]);
  });
});

describe('safeFileHeaders', () => {
  it('görsel/pdf inline; svg/html/bilinmeyen attachment; her zaman nosniff + sandbox CSP', () => {
    expect(safeFileHeaders('image/png', 'a.png')['Content-Disposition']).toMatch(/^inline;/);
    const svg = safeFileHeaders('image/svg+xml', 'a.svg');
    expect(svg['Content-Disposition']).toMatch(/^attachment;/);
    expect(svg['Content-Type']).toBe('image/svg+xml');
    const html = safeFileHeaders('text/html', 'x.html');
    expect(html['Content-Type']).toBe('application/octet-stream');
    expect(html['Content-Disposition']).toMatch(/^attachment;/);
    expect(html['X-Content-Type-Options']).toBe('nosniff');
    expect(html['Content-Security-Policy']).toContain('sandbox');
    expect(safeFileHeaders('image/png', 'a"\r\nX: y.png')['Content-Disposition']).not.toMatch(/[\r\n]/);
  });
});

describe('publicFileUrl + ürün görseli kabulü', () => {
  it('iç public URL ve eski tam URL kabul; başka bayi / harici red', () => {
    const key = 'products/d1/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg';
    expect(isAcceptedProductImage(publicFileUrl(key), 'd1')).toBe(true);
    expect(isAcceptedProductImage(publicFileUrl(key), 'd2')).toBe(false);
    expect(isAcceptedProductImage(`${BASE}/${key}`, 'd1', BASE)).toBe(true);
    expect(isAcceptedProductImage('/api/files/public/products/d1/../d2/x.jpg', 'd1')).toBe(false);
    expect(isAcceptedProductImage('https://evil.test/x.jpg', 'd1', BASE)).toBe(false);
  });
});
