/**
 * P0-35 / O3: e-posta HTML enjeksiyonu — YENİDEN ÜRETİM.
 * Bayi `businessName` alanına `<a href="https://kotu.example/giris">Hesabınızı doğrulayın</a>`
 * yazar ve bir yoruma yanıt verir → müşteri, Qratex logolu ve Qratex göndericili işlem
 * e-postasında tıklanabilir bir oltalama bağlantısı görüyordu. Aynı açık haftalık digest'te
 * (bayi adı + LLM özeti) ve kayıt doğrulama e-postasında (serbest metin kullanıcı adı) vardı.
 * Gönderim katmanı mock'lanır; üretilen HTML/metin doğrudan denetlenir.
 */
const mockSend = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    settings: { findUnique: jest.fn(async () => null) },
  },
}));
jest.mock('@/lib/mail-sender', () => ({
  isMailConfigured: () => true,
  sendTransactionalEmail: (...a: unknown[]) => mockSend(...a),
}));
jest.mock('@/lib/public-app-origin', () => ({ getPublicAppOrigin: () => 'https://app.qratex.example' }));
jest.mock('@/lib/ai-engine', () => ({ runChatCompletion: jest.fn() }));

import { emailDealerReply, renderEmailLinesHtml } from '@/lib/notify-email';
import { buildEmailHtml, type WeekStats } from '@/lib/weekly-digest-core';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';
import { GROWTH_PLAYBOOKS } from '@/lib/growth-playbooks';

const PHISH = '<a href="https://kotu.example/giris">Hesabınızı doğrulayın</a>';

/** HTML'deki tüm href değerleri (yalnız şablonun kendi bağlantıları olmalı). */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

function sentMail(): { html: string; text: string; subject: string } {
  expect(mockSend).toHaveBeenCalledTimes(1);
  return mockSend.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ ok: true });
  mockUserFindUnique.mockResolvedValue({ email: 'musteri@ornek.com' });
});

describe('bayi yanıtı e-postası (emailDealerReply)', () => {
  it('işletme adındaki <a> etiketi bağlantıya dönüşmez; yalnız şablonun kendi bağlantıları kalır', async () => {
    await emailDealerReply({ customerId: 'u1', dealerName: PHISH, feedbackSnippet: '<img src=x onerror=alert(1)>' });
    const { html, text } = sentMail();
    expect(html).not.toContain('<a href="https://kotu.example');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;a href=');
    for (const h of hrefs(html)) expect(h.startsWith('https://app.qratex.example')).toBe(true);
    // Düz metin istemcileri de "https://kotu.example" desenini bağlantıya çevirmesin.
    expect(text).not.toContain('https://kotu.example');
  });

  it('düz alan adı (kotu-site.com) otomatik bağlantıya dönüşmesin diye kırılır', () => {
    const html = renderEmailLinesHtml([[{ strong: 'Destek: qratex-destek.com' }]]);
    expect(html).not.toContain('qratex-destek.com');
    expect(html).toContain('qratex-destek.&#8203;com');
  });
});

describe('haftalık digest e-postası (buildEmailHtml)', () => {
  const stats: WeekStats = {
    total: 3,
    prevTotal: 2,
    avgRating: 4.1,
    prevAvgRating: 3.9,
    negativeCount: 1,
    churnHighCount: 0,
    topThemes: [{ theme: '<script>alert(1)</script>', count: 2 }],
  };

  it('bayi adı, LLM özeti ve temalar kaçışlanır; enjekte bağlantı/etiket çıkmaz', () => {
    const html = buildEmailHtml(PHISH, `Özet ${PHISH} ve odeme@kotu.example`, stats, GROWTH_PLAYBOOKS[0]);
    expect(html).not.toMatch(/<a\s/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain('odeme@kotu.example');
  });
});

describe('kayıt doğrulama / şifre sıfırlama e-postası (lib/email)', () => {
  it('serbest metin kullanıcı adı etiket ya da tıklanabilir alan adı üretemez', async () => {
    await sendVerificationEmail('hedef@ornek.com', 'https://app.qratex.example/auth/verify?token=t', 'Askıda: kotu-site.com <b>x</b>');
    const { html, text } = sentMail();
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('kotu-site.com');
    expect(text).not.toContain('kotu-site.com');
    expect(html).toContain('Merhaba Askıda');
    for (const h of hrefs(html)) expect(h.startsWith('https://app.qratex.example')).toBe(true);
  });

  it('adı olmayan kullanıcıya düz selamlama', async () => {
    await sendPasswordResetEmail('a@b.com', 'https://app.qratex.example/reset?t=1');
    const { html, text } = sentMail();
    expect(html).toContain('<p>Merhaba,</p>');
    expect(text).toContain('Merhaba,');
  });
});
